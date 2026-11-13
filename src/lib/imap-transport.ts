/** Porta 143 negocia TLS antes do login; nunca permite autenticação sem criptografia. */
export function imapTransport(port = 993, implicitTls = true) {
  const secure = implicitTls && port !== 143;
  return {
    secure,
    doSTARTTLS: !secure,
    tls: { rejectUnauthorized: true },
  };
}