import type { ImapConfig } from "./imap-config";
import { imapTransport } from "./imap-transport";

/** TLS obrigatório; nenhum erro do provedor (que pode conter credenciais) sai desta função. */
export async function validarConexaoImap(config: ImapConfig) {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: config.host, port: config.port, ...imapTransport(config.port),
    auth: { user: config.user, pass: config.pass }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
  });
  try {
    await client.connect();
    const status = await client.status("INBOX", { messages: true });
    return { ok: true, mensagens: status.messages ?? 0 };
  } catch {
    throw new Error("Não foi possível conectar por IMAP seguro. Confira servidor, porta, usuário, senha e a liberação de acesso pela TI.");
  } finally {
    client.close();
  }
}

export async function senhaImapConta(accountId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("ler_senha_imap", { p_account_id: accountId });
  if (error || typeof data !== "string" || !data) throw new Error("Senha IMAP não configurada. Cadastre novamente a conta.");
  return data;
}