import { afterEach, expect, it, vi } from "vitest";
import { adminComAutor } from "./audit-admin.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("isola o autor verificado por requisição, inclusive com chave opaca", async () => {
  vi.stubEnv("SUPABASE_URL", "https://backend.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  const autores: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
    const headers = new Headers(init.headers);
    autores.push(headers.get("x-ouvidesk-autor") ?? "");
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("apikey")).toBe("sb_secret_test");
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const primeiro = adminComAutor("00000000-0000-0000-0000-000000000001");
  const segundo = adminComAutor("00000000-0000-0000-0000-000000000002");
  await primeiro.from("protocolos").select("id");
  await segundo.from("protocolos").select("id");
  await primeiro.from("protocolos").select("id");
  expect(autores).toEqual([
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000001",
  ]);
});