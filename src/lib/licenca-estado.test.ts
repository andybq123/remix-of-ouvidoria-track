import { describe, expect, it } from "vitest";
import { decidirEstado, MENSAGEM_BLOQUEIO } from "./licenca-estado";
import { assertLicencaLiberada } from "./licenca-guard";

const livre = { bloqueado: false, motivo: null, codigo: null };
const preso = { bloqueado: true, motivo: "Expirou", codigo: "expired" };

describe("decidirEstado", () => {
  for (const codigo of ["instance_blocked", "revoked", "suspended", "expired"]) {
    it(`${codigo} bloqueia`, () => {
      expect(decidirEstado({ valida: false, mensagem: "Motivo X", codigo }, livre)).toEqual({ bloqueado: true, motivo: "Motivo X", codigo });
    });
  }
  it("valida libera", () => {
    expect(decidirEstado({ valida: true, codigo: "valid" }, preso).bloqueado).toBe(false);
  });
  it("servidor fora do ar mantém o estado anterior", () => {
    expect(decidirEstado(null, preso)).toBe(preso);
    expect(decidirEstado(null, livre)).toBe(livre);
  });
});

describe("assertLicencaLiberada", () => {
  it("recusa gravação quando bloqueado", async () => {
    const client = { rpc: async () => ({ data: true, error: null }) };
    await expect(assertLicencaLiberada(client)).rejects.toThrow(MENSAGEM_BLOQUEIO);
  });
  it("permite quando liberado", async () => {
    const client = { rpc: async () => ({ data: false, error: null }) };
    await expect(assertLicencaLiberada(client)).resolves.toBeUndefined();
  });
});
