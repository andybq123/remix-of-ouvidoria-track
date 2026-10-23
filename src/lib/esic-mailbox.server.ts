import { extrairPedidoEsic } from "./esic";
import { ESIC_MAIL_BATCH, intervaloEsic, pastasEsic, type EsicMailboxCursor } from "./esic-mailbox";
import { exigirIngestaoAtiva } from "./import-maintenance.server";
import { ingerirEmail } from "./protocolo-ingest.server";

export async function rechecarLoteEsic(cursor: EsicMailboxCursor) {
  exigirIngestaoAtiva();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conta, error } = await supabaseAdmin.from("email_inbox_accounts").select("*")
    .eq("id", cursor.accountId).eq("ativo", true).single();
  if (error) throw error;
  const stats = { lidos: 0, encontrados: 0, registrados: 0, erros: 0, detalhes: [] as string[] };
  async function processar(email: { assunto: string; corpo: string; remetente: string; destinatario: string; externalId: string; receivedAt?: string }) {
    stats.lidos++;
    if (!extrairPedidoEsic(`${email.assunto}\n${email.corpo}`)) return;
    stats.encontrados++;
    if (!email.receivedAt || !Number.isFinite(Date.parse(email.receivedAt))) {
      stats.erros++; stats.detalhes.push("E-SIC sem data de recebimento válida; revisar mensagem."); return;
    }
    const resultado = await ingerirEmail({ account: conta, ...email, recheckEsic: true });
    if (!resultado.ok) { stats.erros++; stats.detalhes.push(resultado.error ?? "Falha ao registrar e-SIC"); }
    else if (resultado.protocoloId) stats.registrados++;
  }
  if (conta.provider === "gmail") {
    async function get(path: string) {
      const lov = process.env.LOVABLE_API_KEY;
      const gm = process.env.GOOGLE_MAIL_API_KEY;
      if (!lov || !gm) throw new Error("Conta antiga: cadastre o mesmo e-mail com senha de app em Nova conta.");
      const r = await fetch(`https://connector-gateway.lovable.dev/google_mail/gmail/v1${path}`, {
        headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": gm },
      });
      if (!r.ok) throw new Error(`Gmail ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return r.json();
    }
    const params = new URLSearchParams({ maxResults: String(ESIC_MAIL_BATCH), includeSpamTrash: "true" });
    if (cursor.pageToken) params.set("pageToken", cursor.pageToken);
    const pagina = await get(`/users/me/messages?${params}`);
    // No date, search, Inbox-label or page-count restriction.
    for (const item of pagina.messages ?? []) {
      const msg = await get(`/users/me/messages/${encodeURIComponent(item.id)}?format=full`);
      const headers = msg.payload?.headers ?? [];
      const h = (name: string) => headers.find((x: any) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      const textos: string[] = [];
      function walk(p: any) {
        if (["text/plain", "text/html"].includes(p?.mimeType) && p.body?.data) {
          textos.push(Buffer.from(p.body.data, "base64url").toString("utf8"));
        }
        for (const part of p?.parts ?? []) walk(part);
      }
      walk(msg.payload);
      await processar({ assunto: h("Subject"), corpo: textos.join("\n"), remetente: h("From"), destinatario: h("To"),
        externalId: item.id, receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : undefined });
    }
    return { ...stats, pasta: "Toda a caixa", proximo: pagina.nextPageToken ? { accountId: conta.id, pageToken: pagina.nextPageToken } : null };
  }
  if (conta.provider !== "imap") throw new Error("Conta não permite leitura da caixa de e-mail.");
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  if (!conta.imap_host || !conta.imap_user || !conta.imap_password) throw new Error("Credenciais de e-mail incompletas.");
  const client = new ImapFlow({ host: conta.imap_host, port: conta.imap_port ?? 993, secure: conta.imap_tls ?? true,
    auth: { user: conta.imap_user, pass: conta.imap_password }, logger: false });
  try {
    await client.connect();
    const pastas = pastasEsic(await client.list());
    const indice = cursor.folder ? pastas.findIndex(p => p.path === cursor.folder) : 0;
    if (indice < 0) throw new Error("A pasta em conferência não existe mais. Reinicie a busca.");
    const pasta = pastas[indice];
    if (!pasta) return { ...stats, pasta: "Toda a caixa", proximo: null };
    const lock = await client.getMailboxLock(pasta.path, { readOnly: true });
    try {
      const status = await client.status(pasta.path, { uidValidity: true, uidNext: true });
      const validade = String(status.uidValidity ?? "");
      if (cursor.uidValidity && cursor.uidValidity !== validade) throw new Error("A pasta mudou durante a busca. Reinicie a conferência para evitar perda de mensagens.");
      const maxUid = cursor.maxUid ?? Math.max(0, Number(status.uidNext ?? 1) - 1);
      const intervalo = intervaloEsic(cursor.nextUid ?? 1, maxUid);
      // Sequence holes are normal; UID intervals still progress until uidNext.
      if (intervalo.inicio <= intervalo.fim) {
        const uids = await client.search({ uid: `${intervalo.inicio}:${maxUid}` }, { uid: true });
        const loteUids = Array.isArray(uids) ? uids.filter(uid => uid >= intervalo.inicio && uid <= maxUid).sort((a, b) => a - b).slice(0, ESIC_MAIL_BATCH) : [];
        // Jump over deleted UID gaps instead of making thousands of empty requests.
        const ultimo = loteUids.at(-1);
        intervalo.proximo = ultimo && ultimo < maxUid ? ultimo + 1 : null;
        const mensagens = loteUids.length ? await client.fetchAll(loteUids, { uid: true, source: true, internalDate: true }, { uid: true }) : [];
        for (const msg of mensagens) {
          if (!msg.source) throw new Error("Mensagem sem conteúdo; tente novamente.");
          const parsed = await simpleParser(msg.source);
          const remetente = parsed.from?.text ?? "";
          const destinatario = parsed.to && "text" in parsed.to ? parsed.to.text : conta.email;
          const corpo = `${parsed.text ?? ""}\n${typeof parsed.html === "string" ? parsed.html : ""}`;
          // Inbox keeps its original identity. Other folders use folder-qualified UIDs.
          const externalId = pasta.path.toUpperCase() === "INBOX" ? `uid:${validade}:${msg.uid}` : `folder:${encodeURIComponent(pasta.path)}:${validade}:${msg.uid}`;
          await processar({ assunto: parsed.subject ?? "", corpo, remetente, destinatario, externalId,
            receivedAt: msg.internalDate instanceof Date ? msg.internalDate.toISOString() : parsed.date?.toISOString() });
        }
      }
      const seguinte = pastas[indice + 1];
      const proximo: EsicMailboxCursor | null = intervalo.proximo
        ? { accountId: conta.id, folder: pasta.path, uidValidity: validade, nextUid: intervalo.proximo, maxUid }
        : seguinte ? { accountId: conta.id, folder: seguinte.path } : null;
      return { ...stats, pasta: pasta.path, proximo };
    } finally { lock.release(); }
  } finally { try { await client.logout(); } catch { /* Keep original error. */ } }
}