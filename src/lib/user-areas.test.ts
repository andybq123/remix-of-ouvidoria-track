import { describe, it, expect } from "vitest";
import { agruparAreasPorEmail, normalizarEmailAreas, prepararVinculosAreas } from "./user-areas";

describe("normalizarEmailAreas", () => {
  it("padroniza para minúsculas sem espaços", () => {
    expect(normalizarEmailAreas("  Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
  });
});

describe("prepararVinculosAreas", () => {
  it("remove áreas duplicadas e normaliza o e-mail", () => {
    expect(prepararVinculosAreas(" Ana@X.com ", ["a", "a", "b"])).toEqual([
      { email: "ana@x.com", secretaria_id: "a" },
      { email: "ana@x.com", secretaria_id: "b" },
    ]);
  });
  it("lista vazia significa sem restrição (vê todas as áreas)", () => {
    expect(prepararVinculosAreas("ana@x.com", [])).toEqual([]);
    expect(prepararVinculosAreas("ana@x.com")).toEqual([]);
  });
});

describe("agruparAreasPorEmail", () => {
  it("agrupa vínculos por e-mail sem duplicar áreas", () => {
    const mapa = agruparAreasPorEmail([
      { email: "Ana@X.com", secretaria_id: "a" },
      { email: "ana@x.com", secretaria_id: "b" },
      { email: "ana@x.com", secretaria_id: "a" },
      { email: "bob@x.com", secretaria_id: "c" },
    ]);
    expect(mapa.get("ana@x.com")).toEqual(["a", "b"]);
    expect(mapa.get("bob@x.com")).toEqual(["c"]);
  });
});

import { separarAreas } from "./user-areas";
describe("separarAreas", () => {
  it("separa Vigilância (local) da Saúde (secretaria)", () => {
    expect(separarAreas(["sec-saude", "local:vig", "local:vig"])).toEqual({ secretarias: ["sec-saude"], locais: ["vig"] });
  });
});
