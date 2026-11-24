import { describe, expect, it } from "vitest";
import { museTokenInputSchema } from "./ai-config.functions";

/**
 * Validação do campo "Token da API Muse" (Configurações > IA).
 * Só o schema é testado aqui: o handler exige sessão admin + banco,
 * então salvar/limpar de verdade fica para o teste manual na VPS.
 */
describe("token do Muse (Configurações > IA)", () => {
  it("aceita token longo e aceita limpar sem token", () => {
    expect(
      museTokenInputSchema.safeParse({ apiKey: "um-token-aleatorio-bem-longo-123" }).success,
    ).toBe(true);
    expect(museTokenInputSchema.safeParse({ clearKey: true }).success).toBe(true);
  });

  it("rejeita token curto, vazio e longo demais", () => {
    expect(museTokenInputSchema.safeParse({ apiKey: "curto" }).success).toBe(false);
    expect(museTokenInputSchema.safeParse({ apiKey: "   " }).success).toBe(false);
    expect(museTokenInputSchema.safeParse({ apiKey: "x".repeat(501) }).success).toBe(false);
  });

  it("rejeita salvar sem token e sem pedir limpeza", () => {
    expect(museTokenInputSchema.safeParse({}).success).toBe(false);
    expect(museTokenInputSchema.safeParse({ clearKey: false }).success).toBe(false);
  });
});
