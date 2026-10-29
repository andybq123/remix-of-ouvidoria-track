import { describe, expect, it } from "vitest";
import { COLUNAS_DASHBOARD, montarProtocolosDashboard } from "./dashboard-dados";

describe("montarProtocolosDashboard", () => {
  it("reconstrói a ouvidoria com secretaria, local e responsável", () => {
    const linha: any[] = COLUNAS_DASHBOARD.map(() => null);
    linha[0] = "p1"; linha[1] = "570/2026"; linha[6] = "aberto"; linha[7] = "s1"; linha[13] = "2026-10-01"; linha[16] = true;
    linha.push("UBS Centro", "Maria");
    const [p] = montarProtocolosDashboard([linha], [{ id: "s1", nome: "Saúde", sigla: "SMS", icone: "cruz" }]);
    expect(p.numero).toBe("570/2026");
    expect(p.data_abertura).toBe("2026-10-01");
    expect(p.prorrogado).toBe(true);
    expect(p.secretarias).toEqual({ nome: "Saúde", sigla: "SMS", icone: "cruz" });
    expect(p.locais).toEqual({ nome: "UBS Centro" });
    expect(p.secretaria_responsaveis).toEqual({ nome: "Maria" });
  });
  it("sem secretaria/local fica nulo", () => {
    const linha: any[] = [...COLUNAS_DASHBOARD.map(() => null), null, null];
    const [p] = montarProtocolosDashboard([linha], []);
    expect(p.secretarias).toBeNull();
    expect(p.locais).toBeNull();
    expect(p.prorrogado).toBe(false);
  });
});
