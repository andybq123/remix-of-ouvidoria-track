import { describe, expect, it } from "vitest";
import { mapDepartmentOf, matchesMapDepartment } from "./map-departments";

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
