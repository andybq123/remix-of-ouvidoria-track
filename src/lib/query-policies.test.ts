import { describe, expect, it } from "vitest";
import { createAppQueryClient, shouldRetry } from "./query-policies";

describe("políticas do TanStack Query", () => {
  const qc = createAppQueryClient();
  it("secretarias ficam frescas por 5 minutos", () => {
    expect(qc.getQueryDefaults(["secretarias"]).staleTime).toBe(300_000);
  });
  it("detalhe do protocolo fica fresco por 15 segundos", () => {
    expect(qc.getQueryDefaults(["protocolo", "x"]).staleTime).toBe(15_000);
  });
  it("padrão é 30 segundos e cache inativo de 5 minutos", () => {
    expect(qc.getDefaultOptions().queries?.staleTime).toBe(30_000);
    expect(qc.getDefaultOptions().queries?.gcTime).toBe(300_000);
  });
  it("no máximo 1 nova tentativa", () => {
    expect(shouldRetry(0, new Error("rede"))).toBe(true);
    expect(shouldRetry(1, new Error("rede"))).toBe(false);
  });
  it("não repete erro de permissão", () => {
    expect(shouldRetry(0, { status: 403 })).toBe(false);
    expect(shouldRetry(0, { code: "42501" })).toBe(false);
  });
});
