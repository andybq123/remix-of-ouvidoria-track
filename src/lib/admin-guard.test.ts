import { describe, it, expect } from "vitest";
import { exigirAdmin } from "./admin-guard.server";
const ctx = (data: any, error: any = null) => ({ userId: "u1", supabase: { rpc: async () => ({ data, error }) } });
describe("exigirAdmin", () => {
  it("bloqueia usuário comum", async () => { await expect(exigirAdmin(ctx(false))).rejects.toThrow("Acesso negado"); });
  it("bloqueia quando a verificação falha", async () => { await expect(exigirAdmin(ctx(null, { message: "x" }))).rejects.toThrow(); });
  it("libera administrador", async () => { await expect(exigirAdmin(ctx(true))).resolves.toBeUndefined(); });
});
