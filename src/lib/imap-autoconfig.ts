/** Regras puras da detecção automática (estilo Thunderbird); sem rede, testáveis. */
export type Seguranca = "SSL" | "STARTTLS";
export type CandidatoImap = { host: string; port: number; seguranca: Seguranca; usuario?: "email" | "local" };

const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function dominioDoEmail(email: string): string | null {
  const m = /^[^\s@]+@([^\s@]+)$/.exec(email.trim().toLowerCase());
  return m && HOST_RE.test(m[1]) ? m[1] : null;
}

export function usuariosCandidatos(email: string, preferido?: "email" | "local"): string[] {
  const e = email.trim().toLowerCase();
  const local = e.split("@")[0];
  const lista = preferido === "local" ? [local, e] : [e, local];
  return [...new Set(lista.filter(Boolean))];
}

/** Lê os servidores IMAP de um XML de autoconfiguração (ISPDB/autoconfig); ignora conexões sem criptografia. */
export function lerAutoconfigXml(xml: string): CandidatoImap[] {
  const out: CandidatoImap[] = [];
  const blocos = xml.match(/<incomingServer\s+type=["']imap["'][^>]*>[\s\S]*?<\/incomingServer>/gi) ?? [];
  for (const b of blocos) {
    const tag = (n: string) => new RegExp(`<${n}>\\s*([^<]+?)\\s*</${n}>`, "i").exec(b)?.[1];
    const host = tag("hostname")?.toLowerCase();
    const port = Number(tag("port"));
    const socket = tag("socketType")?.toUpperCase();
    const user = tag("username") ?? "";
    if (!host || !HOST_RE.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) continue;
    if (socket !== "SSL" && socket !== "STARTTLS") continue;
    out.push({ host, port, seguranca: socket, usuario: /%EMAILLOCALPART%/i.test(user) ? "local" : "email" });
  }
  return out;
}

/** Palpites na mesma ordem do Thunderbird: imap., mail., domínio; SSL antes de STARTTLS. */
export function palpitesServidor(dominio: string): CandidatoImap[] {
  const hosts = [`imap.${dominio}`, `mail.${dominio}`, dominio];
  return hosts.flatMap(host => [
    { host, port: 993, seguranca: "SSL" as const },
    { host, port: 143, seguranca: "STARTTLS" as const },
  ]);
}

export function seguracaDaPorta(port: number): Seguranca {
  return port === 993 ? "SSL" : "STARTTLS";
}

/** Erros do provedor viram mensagens fixas; nunca repassa texto do servidor (pode conter credenciais). */
export function mensagemErroImap(e: any, host: string): string {
  const code = String(e?.code ?? e?.cause?.code ?? "");
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|LOGIN failed/i.test(String(e?.responseText ?? ""))) {
    return "O servidor recusou o usuário ou a senha. Confira a senha (a mesma do Thunderbird/webmail).";
  }
  if (/CERT|SELF_SIGNED|ALTNAME|UNABLE_TO_VERIFY/.test(code)) {
    return `O certificado de segurança não corresponde a ${host}. Use "Detectar configurações" para encontrar o nome correto do servidor.`;
  }
  if (/^Closed/i.test(code) || /NoConnection/i.test(code)) {
    return `O servidor ${host} encerrou a conexão antes do login. Pode ser bloqueio temporário por tentativas com senha errada: aguarde alguns minutos ou peça à TI para liberar o IP do servidor do sistema.`;
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ECONNRESET/.test(code) || /timeout/i.test(String(e?.message ?? ""))) {
    return `O servidor ${host} não respondeu nessa porta. Confira o endereço ou se a TI liberou o acesso a partir do servidor do sistema.`;
  }
  return "Não foi possível conectar por IMAP seguro. Confira servidor, porta, usuário e senha.";
}
