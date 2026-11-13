import { describe, expect, it } from "vitest";
import { imapTransport } from "./imap-transport";

describe("Transporte compartilhado de cadastro, coleta e e-SIC", () => {
  it("mantém SSL/TLS direto na porta 993", () => {
    expect(imapTransport(993)).toEqual({ secure: true, doSTARTTLS: false, tls: { rejectUnauthorized: true } });
  });
  it("exige STARTTLS na porta 143 mesmo em contas com flag TLS antiga", () => {
    expect(imapTransport(143, true)).toEqual({ secure: false, doSTARTTLS: true, tls: { rejectUnauthorized: true } });
  });
  it("não permite conexão sem criptografia nas contas legadas", () => {
    expect(imapTransport(1143, false)).toEqual({ secure: false, doSTARTTLS: true, tls: { rejectUnauthorized: true } });
  });
});