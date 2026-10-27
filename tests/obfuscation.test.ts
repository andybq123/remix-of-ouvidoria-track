import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { obfuscateBrowserChunk, shouldObfuscateChunk } from "../tooling/obfuscation";

const licenseModule = "/project/src/routes/_authenticated/licenca.tsx";
describe("ofuscação seletiva da distribuição", () => {
  it("transforma somente chunks de licença do navegador", () => {
    expect(shouldObfuscateChunk(false, false, [licenseModule])).toBe(true);
    expect(shouldObfuscateChunk(true, false, [licenseModule])).toBe(false);
    expect(shouldObfuscateChunk(false, true, [licenseModule])).toBe(false);
    expect(shouldObfuscateChunk(false, false, ["/project/node_modules/react/index.js"])).toBe(false);
  });
  it("preserva resultados, sem eval ou source maps", () => {
    const original = "function verificarLicenca(valor){return valor === 'valid' ? 'liberado' : 'bloqueado'}; verificarLicenca('valid')";
    const protegido = obfuscateBrowserChunk(original);
    expect(protegido).not.toBe(original);
    expect(runInNewContext(protegido)).toBe("liberado");
    expect(protegido).not.toMatch(/\beval\s*\(|sourceMappingURL/);
    expect(obfuscateBrowserChunk(original)).toBe(protegido);
  });
  it("mantém as exportações ES modules", async () => {
    const protegido = obfuscateBrowserChunk("const status = (v) => v === 'valid'; export { status };");
    expect(protegido).toMatch(/export\s*\{/);
    expect(protegido).toMatch(/\bas status\b|\{status\}/);
    const modulo = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(protegido).toString("base64")}`);
    expect(modulo.status("valid")).toBe(true);
    expect(modulo.status("expired")).toBe(false);
  });
  it("preserva URLs literais utilizadas na troca de domínio da VPS", () => {
    const protegido = obfuscateBrowserChunk("export const endpoint = 'https://original.example/rest/v1';");
    expect(protegido).toContain("https://original.example/rest/v1");
  });
});