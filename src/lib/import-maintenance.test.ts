import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ingestaoPausada,
  exigirIngestaoAtiva,
  restauracaoAutomaticaIaBloqueada,
  validarTabelaImportacao,
} from "./import-maintenance.server";
import { lerChavesArquivo, restaurarChavesSeNecessario } from "./ai-keys-store.server";
import { buildProtocolosAntigos } from "./protocolos-antigos-merge";
import ouvidorias from "@/data/ouvidorias.json";
import atrasadas from "@/data/ouvidorias-atrasadas.json";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  dirs.splice(0);
});
function ambiente() {
  const dir = mkdtempSync(join(tmpdir(), "seta-maintenance-"));
  dirs.push(dir);
  mkdirSync(join(dir, "local-docker"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  return join(dir, "local-docker");
}

describe("preparação de base limpa", () => {
  it("não repovoa relatórios a partir de JSON antigo", () => {
    expect(ouvidorias).toEqual([]);
    expect(atrasadas).toEqual([]);
    expect(buildProtocolosAntigos([])).toEqual([]);
  });
  it("não muda a ingestão normal sem marcador", () => {
    ambiente();
    expect(ingestaoPausada()).toBe(false);
    expect(() => exigirIngestaoAtiva()).not.toThrow();
  });
  it("bloqueia todas as operações que exigem ingestão ativa durante a importação", () => {
    const dir = ambiente();
    writeFileSync(join(dir, ".ingestao-pausada"), "pausa");
    expect(ingestaoPausada()).toBe(true);
    expect(() => exigirIngestaoAtiva()).toThrow("Ingestão pausada");
  });
  it("permite restaurar protocolos, mas não logs, coletas e IA durante a importação", () => {
    const dir = ambiente();
    writeFileSync(join(dir, ".ingestao-pausada"), "pausa");
    for (const tabela of ["email_inbox_log", "coletas", "ai_config"]) {
      expect(() => validarTabelaImportacao(tabela)).toThrow("não podem ser restaurados");
    }
    for (const tabela of [
      "protocolos",
      "protocolo_historico",
      "protocolos_antigos_conclusoes",
      "secretarias",
    ]) {
      expect(() => validarTabelaImportacao(tabela)).not.toThrow();
    }
  });
  it("não restaura chaves do arquivo ao banco após limpeza intencional", async () => {
    const dir = ambiente();
    const arquivo = join(dir, ".ia-chaves.json");
    vi.stubEnv("IA_CHAVES_FILE", arquivo);
    writeFileSync(
      arquivo,
      JSON.stringify({ grok: "chave-ficticia-antiga", gemini: "outra-ficticia" }),
    );
    writeFileSync(join(dir, ".ia-restauracao-bloqueada"), "bloqueada");
    expect(restauracaoAutomaticaIaBloqueada()).toBe(true);
    expect(await lerChavesArquivo()).toMatchObject({ grok: "chave-ficticia-antiga" });
    expect(await restaurarChavesSeNecessario(null)).toEqual({ grok: null, gemini: null });
    expect(await restaurarChavesSeNecessario({ grok_api_key: "nova-chave-no-banco" })).toEqual({
      grok: "nova-chave-no-banco",
      gemini: null,
    });
  });
});
