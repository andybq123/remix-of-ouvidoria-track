// Somente leitura; não altera cursores, contas nem mensagens.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8080/api/public/email-sync", { signal: AbortSignal.timeout(3000) });
      if (res.ok) { ready = true; break; }
    } catch { /* startup */ }
    await sleep(1000);
  }
  if (!ready) throw new Error("Aplicação não respondeu ao teste de prontidão; mantenha ingestão pausada.");
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Configuração Supabase incompleta.");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  if (key.startsWith("sb_secret_")) delete headers.Authorization;
  const query = "ativo=eq.true&select=id,provider,gmail_history_id,imap_uid_validity,imap_last_uid";
  const res = await fetch(`${base.replace(/\/$/, "")}/rest/v1/email_inbox_accounts?${query}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Falha ao conferir cursores (${res.status}); mantenha pausa.`);
  const contas = await res.json();
  let semCursor = 0;
  for (const conta of contas) {
    if (conta.provider === "gmail" && !conta.gmail_history_id) semCursor++;
    if (conta.provider === "imap" && (!conta.imap_uid_validity || conta.imap_last_uid == null)) semCursor++;
  }
  console.log(`Aplicação pronta. Contas ativas: ${contas.length}. Gmail/IMAP sem cursor incremental: ${semCursor}.`);
  console.log("Cursores Gmail podem expirar no provedor; falhas de histórico fazem recuperação da janela e podem reler mensagens.");
  if (semCursor) {
    console.error("ATENÇÃO: conta sem cursor pode reler mensagens antigas da caixa. Reveja o backup antes de confirmar este risco.");
    process.exit(3);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha de prontidão.");
  process.exit(1);
}
