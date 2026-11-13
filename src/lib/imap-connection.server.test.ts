import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ connect: vi.fn(), status: vi.fn(), close: vi.fn(), options: {} as Record<string, any> }));
vi.mock("imapflow", () => ({ ImapFlow: class {
  constructor(options: Record<string, any>) { fake.options = options; }
  connect = fake.connect;
  status = fake.status;
  close = fake.close;
} }));
vi.mock("./imap-autoconfig.server", () => ({ hostSeguro: vi.fn(async (h: string) => h === "imap.brusque.sc.gov.br" ? "imap.armazemdc.inf.br" : h) }));
import { validarConexaoImap } from "./imap-connection.server";
const config = { host: "mail.example.org", port: 993, user: "ouvidoria", pass: "synthetic-test-only" };
describe("Validação segura IMAP", () => {
  beforeEach(() => { vi.clearAllMocks(); fake.connect.mockResolvedValue(undefined); fake.status.mockResolvedValue({ messages: 14 }); });
  it("confirma leitura da caixa e exige TLS com certificado válido", async () => {
    expect(await validarConexaoImap(config)).toEqual({ ok: true, mensagens: 14, host: "mail.example.org", user: "ouvidoria" });
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
  it("usa STARTTLS obrigatório na porta 143 antes de autenticar", async () => {
    await validarConexaoImap({ ...config, host: "imap.brusque.sc.gov.br", port: 143, user: "anderson.rosa" });
    expect(fake.options.secure).toBe(false);
    expect(fake.options.doSTARTTLS).toBe(true);
    expect(fake.options.tls.rejectUnauthorized).toBe(true);
  });
  it("troca para o nome do certificado (CNAME) antes de autenticar", async () => {
    const r = await validarConexaoImap({ ...config, host: "imap.brusque.sc.gov.br", port: 143 });
    expect(fake.options.host).toBe("imap.armazemdc.inf.br");
    expect(r.host).toBe("imap.armazemdc.inf.br");
  });
  it("tenta usuário alternativo só quando a senha é recusada", async () => {
    fake.connect.mockRejectedValueOnce(Object.assign(new Error("x"), { authenticationFailed: true })).mockResolvedValueOnce(undefined);
    const r = await validarConexaoImap({ ...config, user: "a@b.org" }, ["a"]);
    expect(r.user).toBe("a");
    expect(fake.connect).toHaveBeenCalledTimes(2);
  });
  it("não tenta outro usuário quando o servidor não responde", async () => {
    fake.connect.mockRejectedValue(Object.assign(new Error("x"), { code: "ETIMEDOUT" }));
    await expect(validarConexaoImap(config, ["outro"])).rejects.toThrow(/não respondeu/);
    expect(fake.connect).toHaveBeenCalledTimes(1);
  });
});
