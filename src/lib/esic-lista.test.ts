import { describe, it, expect } from "vitest";
import { COLUNAS_CARTAO_ESIC, filtrarEsicPorMes, mesesDisponiveisEsic } from "./esic-lista";
import { calcularPrazo, type TipoProtocolo } from "./prazo";

const lista = [
  { id: "a", data_abertura: "2026-11-01T00:30:00-03:00" },
  { id: "b", data_abertura: "2026-10-31" },
  { id: "c", data_abertura: "2026-10-05" },
];

describe("lista e-SIC", () => {
  it("fornece o tipo e a prorrogação ao abrir o detalhe antes da busca completa", () => {
    const row = { tipo: "esic", prorrogado: true, data_abertura: "2026-11-04" };
    const campos = COLUNAS_CARTAO_ESIC.split(",").map(c => c.trim());
    const cartao = Object.fromEntries(Object.entries(row).filter(([campo]) => campos.includes(campo)));
    const prazo = calcularPrazo(cartao as { tipo: TipoProtocolo; prorrogado: boolean; data_abertura: string });
    expect(prazo.diasTotais).toBe(30);
    expect(prazo.prazoFinal.getFullYear()).toBe(2026);
    expect(prazo.prazoFinal.getMonth()).toBe(11);
    expect(prazo.prazoFinal.getDate()).toBe(4);
  });
  it("'todos' mostra todos os pedidos", () => {
    expect(filtrarEsicPorMes(lista, "todos")).toHaveLength(3);
  });
  it("filtra pelo mês de abertura, inclusive no dia 1º", () => {
    expect(filtrarEsicPorMes(lista, "2026-10").map(p => p.id)).toEqual(["b", "c"]);
    expect(filtrarEsicPorMes(lista, "2026-11").map(p => p.id)).toEqual(["a"]);
  });
  it("lista meses do mais recente ao mais antigo", () => {
    expect(mesesDisponiveisEsic(lista)).toEqual(["2026-11", "2026-10"]);
  });
});
