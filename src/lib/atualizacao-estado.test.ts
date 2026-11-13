import { describe, it, expect } from "vitest";
import { estadoAtualizacao } from "./atualizacao-estado";
const now = Date.parse("2026-11-13T11:22:00Z");
const job = { status: "pendente", created_at: new Date(now - 60_001).toISOString(), updated_at: new Date(now - 180_001).toISOString() };
describe("Recuperação da atualização", () => {
  it("permite cancelar somente fila sem início após um minuto", () => {
    expect(estadoAtualizacao(job, now).podeCancelar).toBe(true);
    expect(estadoAtualizacao({ ...job, created_at: new Date(now - 60_000).toISOString() }, now).podeCancelar).toBe(false);
  });
  it("nunca oferece cancelamento de atualização em execução", () => {
    expect(estadoAtualizacao({ ...job, status: "rodando" }, now).podeCancelar).toBe(false);
  });
  it("avisa após três minutos sem resposta de uma execução", () => {
    expect(estadoAtualizacao({ ...job, status: "rodando" }, now).semResposta).toBe(true);
    expect(estadoAtualizacao({ ...job, status: "rodando", updated_at: new Date(now - 180_000).toISOString() }, now).semResposta).toBe(false);
  });
  it("não trata erros ou conclusões como atualização ativa", () => {
    for (const status of ["erro", "concluido"]) expect(estadoAtualizacao({ ...job, status }, now).ativo).toBe(false);
  });
});