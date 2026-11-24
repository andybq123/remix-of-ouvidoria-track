import { describe, expect, it } from "vitest";
import { classificarAtrasadas, isAtrasadaVencida, musePausado } from "./muse-atrasadas.server";
import type { ProtocoloAtrasadoRow } from "./muse-atrasadas.server";

const REF = new Date("2026-11-24T12:00:00-03:00");

function row(over: Partial<ProtocoloAtrasadoRow>): ProtocoloAtrasadoRow {
  return {
    id: "id-1",
    numero: "3.321/2026",
    tipo: "ouvidoria",
    status: "aberto",
    data_abertura: "2026-09-23",
    prorrogado: false,
    url: "https://brusque.1doc.com.br/?pg=doc/ver&hash=abc",
    secretaria_id: "sec-1",
    secretarias: { nome: "Secretaria de Saúde" },
    ...over,
  };
}

describe("seleção de atrasadas do Muse", () => {
  it("marca como atrasada a ouvidoria vencida há 32 dias (caso 3.321/2026)", () => {
    const r = isAtrasadaVencida(row({}), REF);
    expect(r.atrasada).toBe(true);
    expect(r.diasAtraso).toBe(32);
  });

  it("prorrogada tem 30 dias a mais de prazo", () => {
    const r = isAtrasadaVencida(row({ prorrogado: true }), REF);
    expect(r.atrasada).toBe(true);
    expect(r.diasAtraso).toBe(2);
  });

  it("ouvidoria dentro do prazo, concluída ou de outro tipo não é atrasada", () => {
    expect(isAtrasadaVencida(row({ data_abertura: "2026-11-20" }), REF).atrasada).toBe(false);
    expect(isAtrasadaVencida(row({ status: "concluido" }), REF).atrasada).toBe(false);
    expect(isAtrasadaVencida(row({ tipo: "esic" }), REF).atrasada).toBe(false);
  });

  it("separa elegíveis com link do 1Doc das atrasadas sem link", () => {
    const sel = classificarAtrasadas(
      [
        row({ id: "a", numero: "3.321/2026" }),
        row({ id: "b", numero: "3.677/2026", url: null }),
        row({ id: "c", numero: "3.802/2026", data_abertura: "2026-11-02" }),
        row({ id: "d", numero: "9.999/2026", status: "concluido" }),
      ],
      REF,
    );
    // 3.802/2026 (aberta 02/11, prazo 02/12) ainda não venceu em 24/11.
    expect(sel.elegiveis.map((e) => e.numero)).toEqual(["3.321/2026"]);
    expect(sel.semLink).toBe(1);
    expect(sel.totalAtrasadas).toBe(2);
    expect(sel.secretarias).toEqual([{ id: "sec-1", nome: "Secretaria de Saúde" }]);
  });

  it("flag de pausa: true quando onedoc_config.muse_pausado é true, false sem a coluna", async () => {
    const ok = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { muse_pausado: true }, error: null }) }),
        }),
      }),
    };
    expect(await musePausado(ok as any)).toBe(true);
    const semColuna = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "column does not exist" } }),
          }),
        }),
      }),
    };
    expect(await musePausado(semColuna as any)).toBe(false);
  });
});
