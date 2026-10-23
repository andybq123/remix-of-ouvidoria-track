import { describe, expect, it } from "vitest";
import { mapDepartmentOf, matchesMapDepartment, escoposMapaPermitidos } from "./map-departments";

describe("mapDepartmentOf", () => {
  it("identifica Saúde sem depender de acentos ou maiúsculas", () => {
    expect(mapDepartmentOf({ nome: "Secretaria Municipal de Saúde" })).toBe("saude");
    expect(mapDepartmentOf({ nome: "Saude", sigla: "SMS" })).toBe("saude");
  });

  it("identifica Obras pelo nome, descrição ou sigla SOSU", () => {
    expect(mapDepartmentOf({ nome: "Secretaria de Obras" })).toBe("obras");
    expect(mapDepartmentOf({ nome: "Secretaria de Serviços Urbanos" })).toBe("obras");
    expect(mapDepartmentOf({ nome: "Secretaria Municipal", sigla: "SOSU" })).toBe("obras");
    expect(mapDepartmentOf({ nome: "SOSU - Obras" })).toBe("obras");
  });

  it("ignora secretarias que não pertencem às duas áreas do mapa", () => {
    expect(mapDepartmentOf({ nome: "Secretaria de Educação", sigla: "SEMED" })).toBeNull();
    expect(matchesMapDepartment({ nome: "Secretaria de Educação" }, "todos")).toBe(true);
  });

  it("aplica corretamente o filtro de cada área", () => {
    expect(matchesMapDepartment({ nome: "Saúde" }, "saude")).toBe(true);
    expect(matchesMapDepartment({ nome: "Secretaria de Obras", sigla: "SOSU" }, "obras")).toBe(
      true,
    );
    expect(matchesMapDepartment({ nome: "Saúde" }, "obras")).toBe(false);
  });
});

describe("escoposMapaPermitidos", () => {
  it("sem vínculo de área libera os dois mapas", () => {
    expect(escoposMapaPermitidos([])).toEqual(["saude", "obras"]);
  });

  it("usuário da Saúde vê apenas o mapa da Saúde", () => {
    expect(escoposMapaPermitidos([{ nome: "Saúde" }])).toEqual(["saude"]);
  });

  it("usuário de Obras (SOSU) vê apenas o mapa de Obras", () => {
    expect(escoposMapaPermitidos([{ nome: "SOSU - Obras" }])).toEqual(["obras"]);
  });

  it("usuário com as duas áreas vê os dois mapas", () => {
    expect(escoposMapaPermitidos([{ nome: "Saúde" }, { nome: "SOSU - Obras" }])).toEqual([
      "saude",
      "obras",
    ]);
  });

  it("usuário restrito a área sem mapa não vê nenhum", () => {
    expect(escoposMapaPermitidos([{ nome: "SEFAZ" }])).toEqual([]);
  });
});

import { somenteSaude } from "./map-departments";
describe("somenteSaude", () => {
  it("oculta Protocolos só quando todas as áreas são Saúde", () => {
    expect(somenteSaude([{ nome: "Saúde" }])).toBe(true);
    expect(somenteSaude([{ nome: "Saúde" }, { nome: "Vigilância Sanitária" }])).toBe(false);
    expect(somenteSaude([])).toBe(false);
  });
});
