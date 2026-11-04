import { describe, expect, it } from "vitest";
import { coberturaSaudeMapa } from "./map-health-coverage";
import { isInMonth } from "./month-filter";

describe("ouvidorias da Saúde no mapa", () => {
  const base = { id: "3804", lat: NaN, lng: NaN, mapDepartment: "saude" };
  it("conta na unidade visível mesmo sem coordenadas do protocolo", () => {
    const result = coberturaSaudeMapa([{ ...base, local_id: "ubs" }], [{ id: "ubs" }]);
    expect(result.porUnidade).toBe(1);
    expect(result.individuais).toHaveLength(0);
    expect(result.semLocalizacao).toHaveLength(0);
  });
  it("mostra pino próprio quando tem endereço localizado mas não unidade visível", () => {
    const p = { ...base, local_id: "sem-coordenadas", lat: -27.1, lng: -48.9 };
    expect(coberturaSaudeMapa([p], []).individuais).toEqual([p]);
  });
  it("mantém disponível para tratamento a ouvidoria sem unidade e sem coordenadas", () => {
    expect(coberturaSaudeMapa([base], []).semLocalizacao).toEqual([base]);
  });
  it("não duplica ouvidorias que já estão contadas na unidade", () => {
    const p = { ...base, local_id: "ubs", lat: -27.1, lng: -48.9 };
    const result = coberturaSaudeMapa([p], [{ id: "ubs" }]);
    expect(result.porUnidade).toBe(1);
    expect(result.individuais).toHaveLength(0);
  });
  it("preserva novembro/2026 pelo mês de abertura e exclui outubro", () => {
    const points = [
      { ...base, id: "3804/2026", data_abertura: "2026-11-01" },
      { ...base, id: "outubro", data_abertura: "2026-10-31" },
    ].filter(p => isInMonth(p.data_abertura, "2026-11"));
    expect(coberturaSaudeMapa(points, []).semLocalizacao.map(p => p.id)).toEqual(["3804/2026"]);
  });
});