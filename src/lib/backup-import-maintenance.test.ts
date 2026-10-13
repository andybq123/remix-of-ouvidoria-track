import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupTabela } from "./backup-config";
const mock = vi.hoisted(() => ({ paused: true, rpc: vi.fn() }));
vi.mock("node:fs", () => ({
  existsSync: (path: string) => mock.paused && path.endsWith(".ingestao-pausada"),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mock.rpc } }));
import { importarTabelaValidada } from "./backup-import.server";
beforeEach(() => {
  mock.paused = true;
  mock.rpc.mockReset().mockResolvedValue({ data: 1, error: null });
});
async function importar(tabela: BackupTabela) {
  return importarTabelaValidada(tabela, [{ id: "ficticio" }]);
}
describe("proteção servidor da importação pós-limpeza", () => {
  it("recusa logs, coletas e IA antes de chamar a RPC", async () => {
    for (const tabela of ["email_inbox_log", "coletas", "ai_config"] as const) {
      await expect(importar(tabela)).rejects.toThrow("não podem ser restaurados");
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("permite importar protocolos e históricos do outro sistema", async () => {
    await expect(importar("protocolos")).resolves.toEqual({ gravados: 1 });
    expect(mock.rpc).toHaveBeenCalledWith(
      "backup_importar",
      expect.objectContaining({ p_tabela: "protocolos" }),
    );
  });
  it("não muda importações normais fora da manutenção", async () => {
    mock.paused = false;
    await expect(importar("ai_config")).resolves.toEqual({ gravados: 1 });
  });
});
