import type { ImapConfig } from "./imap-config";
import { imapTransport } from "./imap-transport";
import { mensagemErroImap, seguracaDaPorta } from "./imap-autoconfig";

/**
 * TLS obrigatório com certificado válido. Corrige o servidor pelo CNAME quando o certificado
 * vale para o destino, e tenta usuários alternativos só quando a senha é recusada.
 * Nenhum texto do provedor (que pode conter credenciais) sai desta função.
 */
export async function validarConexaoImap(config: Pick<ImapConfig, "host" | "port" | "user" | "pass">, usuariosAlternativos: string[] = []) {
  const { ImapFlow } = await import("imapflow");
  let host = config.host;
  try {
    const { hostSeguro } = await import("./imap-autoconfig.server");
    host = await hostSeguro(config.host, config.port, seguracaDaPorta(config.port));
  } catch { /* mantém o nome digitado */ }
  const usuarios = [...new Set([config.user, ...usuariosAlternativos].filter(Boolean))];
  let ultimoErro: any = null;
  let erroSenha: any = null;
  for (const user of usuarios) {
    const client = new ImapFlow({
      host, port: config.port, ...imapTransport(config.port),
      auth: { user, pass: config.pass }, logger: false,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    });
    try {
      await client.connect();
      const status = await client.status("INBOX", { messages: true });
      return { ok: true, mensagens: status.messages ?? 0, host, user };
    } catch (e: any) {
      ultimoErro = e;
      // Só campos técnicos, nunca o texto do servidor (pode ecoar credenciais).
      console.warn("[imap] falha", { host, port: config.port, code: e?.code ?? null, auth: !!e?.authenticationFailed, status: e?.responseStatus ?? null });
      if (e?.authenticationFailed) { erroSenha = e; continue; }
      break;
    } finally {
      client.close();
    }
  }
  // Se alguma tentativa chegou a recusar a senha, essa é a informação útil para quem cadastra.
  throw new Error(mensagemErroImap(erroSenha ?? ultimoErro, host));
}

export async function senhaImapConta(accountId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("ler_senha_imap", { p_account_id: accountId });
  if (error || typeof data !== "string" || !data) throw new Error("Senha IMAP não configurada. Cadastre novamente a conta.");
  return data;
}
