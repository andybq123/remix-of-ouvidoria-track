import { describe, expect, it } from "vitest";
import { resumoResultados } from "./onedoc-history";
// @ts-expect-error módulo JS do agente VPS
import { resultadoConferencia } from "../../local-docker/agente-1doc/resultado.mjs";

describe("histórico 1Doc", () => {
  const p = { id: "1", numero: "100/2026", status: "aberto", endereco: null, secretaria_id: "obras", secretarias: { nome: "SOSU - Obras" } };
  const a = { situacao: "baixada", baixado_em: "2026-09-17T17:09:49Z", arquivado_em: null };
  it("registra secretaria, data, endereço e conclusão efetivamente salvos", () => {
    const r = resultadoConferencia(p, { endereco: "R. João XXIII, Brusque", status: "concluido", data_conclusao: "2026-09-17" }, a, "regra", new Date("2026-10-20T04:16:00Z"));
    expect(r).toMatchObject({ secretaria_nome: "SOSU - Obras", verificado_em: "2026-10-20T04:16:00.000Z", endereco_atualizado: true, endereco_novo: "R. João XXIII, Brusque", concluido: true, data_conclusao: "2026-09-17" });
  });
  it("endereço preservado não conta como atualizado", () => {
    const r = resultadoConferencia({ ...p, endereco: "Rua X" }, {}, a, "regra");
    expect(r.endereco_atualizado).toBe(false);
    expect(r.endereco_novo).toBe("Rua X");
    expect(r.concluido).toBe(false);
  });
  it("conta alterações e exclui resultados com falha", () => {
    expect(resumoResultados([{ id: "1", endereco_atualizado: true }, { id: "2", concluido: true }, { id: "3", erro: "Falha", concluido: true }, { id: "4" }])).toEqual({ enderecos: 1, concluidos: 1, erros: 1 });
  });
});