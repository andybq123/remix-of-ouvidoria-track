import { describe, expect, it } from "vitest";
import { link1docParaSalvar } from "./url-1doc";

describe("link 1Doc cadastrado manualmente", () => {
  it("aceita link para ouvidoria importada sem link anterior", () => {
    expect(link1docParaSalvar(" brusque.1doc.com.br/?pg=doc&hash=abc ")).toBe("https://brusque.1doc.com.br/?pg=doc&hash=abc");
  });
  it("preserva os parâmetros ao alterar o link", () => {
    expect(link1docParaSalvar("https://brusque.1doc.com.br/?pg=doc&amp;hash=novo")).toBe("https://brusque.1doc.com.br/?pg=doc&hash=novo");
  });
  it("permite remover o link", () => {
    expect(link1docParaSalvar("   ")).toBeNull();
  });
  it.each(["javascript:alert(1)", "https://1doc.com.br.exemplo.com/", "https://falso1doc.com.br/", "não é um link"])("rejeita destino inválido: %s", (link) => {
    expect(() => link1docParaSalvar(link)).toThrow("Informe um link válido do 1Doc");
  });
});