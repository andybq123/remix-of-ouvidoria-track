import { describe, it, expect } from "vitest";
import { parseCsv, normalizarLinhaCsv, emLotes } from "./backup-config";

describe("backup", () => {
  it("lê CSV com aspas e quebra de linha", () => {
    const r = parseCsv('id,descricao\n1,"linha 1\nlinha ""2"""\n2,ok\n');
    expect(r).toEqual([{ id: "1", descricao: 'linha 1\nlinha "2"' }, { id: "2", descricao: "ok" }]);
  });
  it("campos vazios viram nulo e detalhes vira objeto", () => {
    expect(normalizarLinhaCsv({ a: "", detalhes: '{"x":1}' })).toEqual({ a: null, detalhes: { x: 1 } });
  });
  it("divide em lotes de no máximo 500", () => {
    expect(emLotes(Array.from({ length: 1200 }, (_, i) => ({ i }))).map((l) => l.length)).toEqual([500, 500, 200]);
  });
});
