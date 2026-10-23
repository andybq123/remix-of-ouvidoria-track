import { describe, it, expect } from "vitest";
import { avaliarSenha, senhaForte, SENHA_MIN_CARACTERES } from "./password-strength";

describe("avaliarSenha", () => {
  it("rejeita senha vazia", () => {
    const r = avaliarSenha("");
    expect(r.forte).toBe(false);
    expect(r.faltando.length).toBe(r.total);
  });

  it("rejeita senha curta mesmo com todos os tipos de caractere", () => {
    expect(senhaForte("Aa1!")).toBe(false);
    expect(senhaForte("Aa1!xyz")).toBe(false); // 7 < mínimo
  });

  it("rejeita senha sem maiúscula", () => {
    expect(senhaForte("abcdefg1!")).toBe(false);
  });

  it("rejeita senha sem minúscula", () => {
    expect(senhaForte("ABCDEFG1!")).toBe(false);
  });

  it("rejeita senha sem número", () => {
    expect(senhaForte("Abcdefgh!")).toBe(false);
  });

  it("rejeita senha sem caractere especial", () => {
    expect(senhaForte("Abcdefg1")).toBe(false);
  });

  it("aceita senha com todos os critérios", () => {
    expect(senhaForte("OuviDesk@2026")).toBe(true);
    expect(senhaForte("Aa1!wxyz")).toBe(true); // exatamente o mínimo
  });

  it("lista os critérios faltantes", () => {
    const r = avaliarSenha("abc");
    expect(r.faltando).toContain(`Pelo menos ${SENHA_MIN_CARACTERES} caracteres`);
    expect(r.faltando).toContain("Letra maiúscula (A-Z)");
    expect(r.faltando).toContain("Número (0-9)");
    expect(r.faltando).not.toContain("Letra minúscula (a-z)");
  });
});
