import { requireLicencaLiberada } from "@/lib/licenca-middleware";
import { createServerFn } from "@tanstack/react-start";
import { exigirAdmin } from "./admin-guard.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sincronizarGmail = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { sincronizarGmailContas, sincronizarImapContas } = await import("@/lib/protocolo-ingest.server");
    const tot = { contas: 0, novos: 0, erros: 0, detalhes: [] as any[] };
    for (const fn of [sincronizarImapContas, sincronizarGmailContas]) {
      try {
        const r = await fn();
        tot.contas += r.contas; tot.novos += r.novos; tot.erros += r.erros; tot.detalhes.push(...r.detalhes);
      } catch (e: any) { tot.detalhes.push({ error: String(e?.message ?? e) }); }
    }
    return tot;
  });

export const ressincronizarGmail = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(Math.max(d?.dias ?? 30, 1), 90) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { ressincronizarGmailContas } = await import("@/lib/protocolo-ingest.server");
    return await ressincronizarGmailContas(data.dias);
  });

export const reverificarEmails = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(Math.max(d?.dias ?? 60, 1), 180) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { reverificarEmailsSemProtocolo } = await import("@/lib/protocolo-ingest.server");
    return await reverificarEmailsSemProtocolo(data.dias);
  });

export const sincronizarImap = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { sincronizarImapContas } = await import("@/lib/protocolo-ingest.server");
    return await sincronizarImapContas();
  });

export const backfillUrls1Doc = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(Math.max(d?.dias ?? 180, 1), 365) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { backfillUrl1DocViaGmail } = await import("@/lib/protocolo-ingest.server");
    return await backfillUrl1DocViaGmail(data.dias);
  });

export const reprocessarEmail = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { logId: string }) => ({ logId: String(d.logId) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { reprocessarEmailLog } = await import("@/lib/protocolo-ingest.server");
    return await reprocessarEmailLog(data.logId);
  });
/** Testa login IMAP (Gmail com senha de app) sem gravar nada. */
export const testarContaImap = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { host?: string; port?: number; user: string; pass: string }) => ({
    host: String(d.host || "imap.gmail.com").trim(),
    port: Number(d.port || 993),
    user: String(d.user || "").trim(),
    pass: String(d.pass || "").replace(/\s+/g, ""),
  }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Acesso negado");
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({ host: data.host, port: data.port, secure: true, auth: { user: data.user, pass: data.pass }, logger: false });
    try {
      await client.connect();
      const st = await client.status("INBOX", { messages: true });
      return { ok: true, mensagens: st.messages ?? 0 };
    } catch (e: any) {
      const msg = String(e?.responseText || e?.message || e);
      throw new Error(/auth|credentials|invalid/i.test(msg)
        ? "Login recusado pelo Gmail. Confira o e-mail e a senha de app (16 letras) e se a verificação em 2 etapas está ativa."
        : `Falha ao conectar: ${msg}`);
    } finally {
      try { await client.logout(); } catch {}
    }
  });
