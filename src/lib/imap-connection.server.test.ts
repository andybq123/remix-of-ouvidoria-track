import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ connect: vi.fn(), status: vi.fn(), close: vi.fn(), options: {} as Record<string, any> }));
vi.mock("imapflow", () => ({ ImapFlow: class {
  constructor(options: Record<string, any>) { fake.options = options; }
  connect = fake.connect;
  status = fake.status;
  close = fake.close;
} }));
import { validarConexaoImap } from "./imap-connection.server";
const config = { host: "mail.example.org", port: 993, user: "ouvidoria", pass: "synthetic-test-only" };
describe("Validação segura IMAP", () => {
  beforeEach(() => { vi.clearAllMocks(); fake.connect.mockResolvedValue(undefined); fake.status.mockResolvedValue({ messages: 14 }); });
  it("confirma leitura da caixa e exige TLS com certificado válido", async () => {
    expect(await validarConexaoImap(config)).toEqual({ ok: true, mensagens: 14 });
    expect(fake.options.secure).toBe(true);
    expect(fake.options.tls.rejectUnauthorized).toBe(true);
    expect(fake.options.logger).toBe(false);
    expect(fake.status).toHaveBeenCalledWith("INBOX", { messages: true });
    expect(fake.close).toHaveBeenCalledOnce();
  });
  it("não expõe respostas de autenticação e fecha conexão com erro", async () => {
    fake.connect.mockRejectedValue(new Error("Provider response with synthetic-test-only"));
    await expect(validarConexaoImap(config)).rejects.toThrow("Não foi possível conectar por IMAP seguro.");
    expect(fake.close).toHaveBeenCalledOnce();
    expect(fake.status).not.toHaveBeenCalled();
  });
});