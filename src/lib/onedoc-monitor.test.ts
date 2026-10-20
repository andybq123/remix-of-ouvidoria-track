import { describe, expect, it, vi } from "vitest";
import { checkOnedocJobs, onedocScope, restoreOnedocJobs } from "./onedoc-monitor";

const tracked = { id: "lote-obras", scope: "lote:obras", tipo: "lote" as const, startedAt: 1000 };

describe("conferência 1Doc em segundo plano", () => {
  it("recupera o lote da secretaria após recarregar", () => {
    expect(restoreOnedocJobs(JSON.stringify([tracked]))).toEqual([tracked]);
    expect(restoreOnedocJobs("invalid")).toEqual([]);
    expect(onedocScope("lote", undefined, "obras")).toBe("lote:obras");
  });
  it("sinaliza finalização somente após terminar o lote", async () => {
    const receive = vi.fn();
    await checkOnedocJobs([tracked], async () => ({ status: "executando" }), receive);
    expect(receive).toHaveBeenLastCalledWith(tracked, { status: "executando" }, false);
    await checkOnedocJobs([tracked], async () => ({ status: "concluido" }), receive);
    expect(receive).toHaveBeenLastCalledWith(tracked, { status: "concluido" }, true);
  });
  it("continua acompanhando após falha temporária e sinaliza erro final", async () => {
    const receive = vi.fn();
    await checkOnedocJobs([tracked], async () => { throw new Error("Offline"); }, receive);
    expect(receive).not.toHaveBeenCalled();
    await checkOnedocJobs([tracked], async () => ({ status: "erro" }), receive);
    expect(receive).toHaveBeenCalledWith(tracked, { status: "erro" }, true);
  });
});