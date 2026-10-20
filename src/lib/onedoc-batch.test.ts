import { describe, expect, it } from "vitest";
import { idsOuvidorias1doc, onedocInputSchema } from "./onedoc-batch";

describe("lote 1Doc da secretaria selecionada", () => {
  it("envia apenas ouvidorias abertas com link 1Doc da lista fornecida", () => {
    const lista = [
      { id: "obras-aberta", tipo: "ouvidoria", status: "aberto", url: "https://brusque.1doc.com.br/1" },
      { id: "obras-concluida", tipo: "ouvidoria", status: "concluido", url: "https://brusque.1doc.com.br/2" },
      { id: "obras-sem-link", tipo: "ouvidoria", status: "aberto", url: null },
      { id: "esic", tipo: "esic", status: "aberto", url: "https://brusque.1doc.com.br/3" },
    ];
    expect(idsOuvidorias1doc(lista)).toEqual(["obras-aberta"]);
  });
  it("não aceita seleção vazia para evitar conferir todas por engano", () => {
    expect(onedocInputSchema.safeParse({ tipo: "lote", protocoloIds: [] }).success).toBe(false);
  });
  it("preserva os IDs explícitos sem incluir outros protocolos", () => {
    const id = "c247febe-5801-4a01-8835-21da7a132a27";
    expect(onedocInputSchema.parse({ tipo: "lote", protocoloIds: [id] }).protocoloIds).toEqual([id]);
  });
});