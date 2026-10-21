import { describe, expect, it } from "vitest";
import { secretariasComManifestacoes } from "./bi-visualization";

describe("secretariasComManifestacoes", () => {
  it("oculta secretarias com zero ouvidorias e preserva todas as que possuem ouvidorias", () => {
    expect(secretariasComManifestacoes([
      { nome: "Obras", total: 12 },
      { nome: "Educação", total: 0 },
      { nome: "Saúde", total: 1 },
    ])).toEqual([{ nome: "Obras", total: 12 }, { nome: "Saúde", total: 1 }]);
  });
});