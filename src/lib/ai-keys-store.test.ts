import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { lerChavesArquivo, salvarChavesArquivo } from "./ai-keys-store.server";

describe("cópia das chaves de IA", () => {
  it("guarda e remove chaves sem apagar a outra", async () => {
    process.env["IA_CHAVES_FILE"] = path.join(os.tmpdir(), `ia-${Date.now()}.json`);
    await salvarChavesArquivo({ grok: "gsk_1" });
    await salvarChavesArquivo({ gemini: "AIza_2" });
    expect(await lerChavesArquivo()).toEqual({ grok: "gsk_1", gemini: "AIza_2" });
    await salvarChavesArquivo({ grok: null });
    expect(await lerChavesArquivo()).toEqual({ grok: null, gemini: "AIza_2" });
  });
});
