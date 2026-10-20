import { describe, it, expect } from "vitest";
import { assuntosSuspeitos } from "./assuntos-alterados";

const sec = ["Secretaria de Obras"];
describe("assuntos alterados pela falha", () => {
  it("acha troca automática e mostra o assunto anterior", () => {
    const r = assuntosSuspeitos([{ id: "1", numero: "10/2026", assunto: "Secretaria de Obras" }],
      [{ protocolo_id: "1", valor_anterior: "Buraco", valor_novo: "Secretaria de Obras", autor_id: null, created_at: "2026-10-20" }], sec);
    expect(r[0].anterior).toBe("Buraco");
  });
  it("some da lista depois que o usuário corrige", () => {
    const r = assuntosSuspeitos([{ id: "1", numero: "10/2026", assunto: "Buraco" }], [
      { protocolo_id: "1", valor_anterior: "Buraco", valor_novo: "Secretaria de Obras", autor_id: null, created_at: "2026-10-20" },
      { protocolo_id: "1", valor_anterior: "Secretaria de Obras", valor_novo: "Buraco", autor_id: "u", created_at: "2026-10-21" },
    ], sec);
    expect(r).toHaveLength(0);
  });
  it("acha assunto igual ao nome de secretaria mesmo sem histórico", () => {
    expect(assuntosSuspeitos([{ id: "2", numero: "11/2026", assunto: "secretaria de obras" }], [], sec)).toHaveLength(1);
  });
});
