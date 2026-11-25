import { describe, expect, it, vi } from "vitest";
import { VIDEO_POR_ESTADO } from "@/lib/ouvidorizinho-animacao";

const mockRpc = vi.fn(async (..._args: unknown[]) => ({ data: true, error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import {
  VIDEO_BOAS_VINDAS,
  deveMostrarBoasVindas,
  dispensarBoasVindas,
} from "./use-boas-vindas";

describe("card de boas-vindas do primeiro login", () => {
  it("aparece quando o flag é falso", () => {
    expect(deveMostrarBoasVindas(false)).toBe(true);
  });

  it("não aparece quando o flag é verdadeiro", () => {
    expect(deveMostrarBoasVindas(true)).toBe(false);
  });

  it("não aparece sem retorno (fail-closed: não insiste)", () => {
    expect(deveMostrarBoasVindas(null)).toBe(false);
    expect(deveMostrarBoasVindas(undefined)).toBe(false);
  });

  it("a miniatura é o vídeo do Ouvidorzinho no telefone", () => {
    expect(VIDEO_BOAS_VINDAS).toBe(VIDEO_POR_ESTADO.telefone);
    expect(VIDEO_BOAS_VINDAS).toBe("/ouvidorizinho-telefone.mp4");
  });

  it("dispensar marca o flag como visto no servidor", async () => {
    mockRpc.mockClear();
    await dispensarBoasVindas();
    expect(mockRpc).toHaveBeenCalledWith("marcar_boas_vindas_visto");
  });

  it("dispensar não rejeita quando o endpoint falha", async () => {
    mockRpc.mockRejectedValueOnce(new Error("rede fora"));
    await expect(dispensarBoasVindas()).resolves.toBeUndefined();
  });
});
