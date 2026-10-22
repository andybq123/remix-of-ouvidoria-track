import { describe, expect, it } from "vitest";
import { podeReverter1doc } from "./onedoc-revert";
const h = { id: "1", campo: "assunto", acao: "update", autor_nome: "Agente 1Doc", valor_novo: "Demora em marcar consulta / procedimento" };
describe("reversão individual do agente", () => {
  it("permite desfazer o assunto atualizado", () => {
    expect(podeReverter1doc(h, [h], { assunto: h.valor_novo })).toBe(true);
  });
  it("não reverte mudança posterior", () => {
    expect(podeReverter1doc(h, [{ ...h, id: "2" }, h], { assunto: h.valor_novo })).toBe(false);
  });
  it("não permite desfazer duas vezes", () => {
    expect(podeReverter1doc(h, [{ ...h, id: "2", campo: "categoria", contexto: { reversao_de: "1" } }, h], { assunto: h.valor_novo })).toBe(false);
  });
  it.each(["assunto", "categoria", "endereco", "status", "data_conclusao"])("permite reversão isolada de %s", (campo) => {
    const entry = { ...h, campo };
    expect(podeReverter1doc(entry, [entry], { [campo]: h.valor_novo })).toBe(true);
  });
  it("recusa mudança de outro autor ou secretaria", () => {
    expect(podeReverter1doc({ ...h, autor_nome: "Sistema" }, [h], { assunto: h.valor_novo })).toBe(false);
    expect(podeReverter1doc({ ...h, campo: "secretaria_id" }, [h], {})).toBe(false);
  });
});