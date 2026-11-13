import { describe, it, expect } from "vitest";
import { imapConfigSchema } from "./imap-config";

const base = { host: "mail.example.org", user: "ouvidoria@example.org", pass: " synthetic test password " };
describe("Configuração IMAP institucional", () => {
  it("aceita servidor e usuário institucionais com porta segura padrão", () => {
    expect(imapConfigSchema.parse(base).port).toBe(993);
  });
  it("preserva os espaços da senha institucional", () => {
    expect(imapConfigSchema.parse(base).pass).toBe(" synthetic test password ");
  });
  it("aceita porta personalizada válida", () => {
    expect(imapConfigSchema.parse({ ...base, port: 1993 }).port).toBe(1993);
  });
  it("recusa portas inválidas", () => {
    for (const port of [0, 65536, 993.5]) expect(imapConfigSchema.safeParse({ ...base, port }).success).toBe(false);
  });
  it("recusa URLs e servidor ausente", () => {
    for (const host of ["", "https://mail.example.org", "mail.example.org/inbox"]) expect(imapConfigSchema.safeParse({ ...base, host }).success).toBe(false);
  });
});