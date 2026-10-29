import { describe, expect, it } from "vitest";
import { fetchAllPaginated } from "./fetch-all";

const fonte = (total: number) => (from: number, to: number) =>
  Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i), error: null });

describe("fetchAllPaginated", () => {
  it("traz todas as 4500 linhas em ordem", async () => {
    const r = await fetchAllPaginated(fonte(4500));
    expect(r.length).toBe(4500);
    expect(r[4499]).toBe(4499);
  });
  it("funciona com total múltiplo exato da página", async () => {
    expect((await fetchAllPaginated(fonte(2000))).length).toBe(2000);
  });
  it("propaga erro", async () => {
    await expect(fetchAllPaginated(() => Promise.resolve({ data: null, error: new Error("x") }))).rejects.toThrow("x");
  });
});
