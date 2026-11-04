import { describe, it, expect } from "vitest";
import { filtrarEsicPorMes, mesesDisponiveisEsic } from "./esic-lista";

const lista = [
  { id: "a", data_abertura: "2026-11-01T00:30:00-03:00" },
  { id: "b", data_abertura: "2026-10-31" },
  { id: "c", data_abertura: "2026-10-05" },
];

describe("lista e-SIC", () => {
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
