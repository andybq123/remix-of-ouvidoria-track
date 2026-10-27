import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function run(script: string, config?: string) {
  const dir = mkdtempSync(join(tmpdir(), "ouvidesk-licenca-teste-"));
  try {
    if (config !== undefined) writeFileSync(join(dir, "licenca.conf"), config);
    writeFileSync(join(dir, "chave"), "chave-de-teste");
    return spawnSync("bash", ["-c", `
      source local-docker/deploy/comum.sh
      unset LICENCA_URL
      LD='${dir}'
      ${config !== undefined ? `DEPLOY_DIR='${dir}'` : ""}
      LICENCA_ARQ='${dir}/chave'
      LOG='${dir}/log'
      instalacao_id() { printf id-teste; }
      ${script}
    `], { encoding: "utf8" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("licenciamento dos comandos da VPS", () => {
  it("resolve o endereço padrão codificado sem deixá-lo vazio", () => {
    const r = run('u="$(licenca_url)"; [[ "$u" == https://* && "$u" == *.com.br ]]');
    expect(r.status).toBe(0);
  });
  it("mantém prioridade da configuração local", () => {
    const r = run('LICENCA_URL=https://licenca.exemplo.invalid; [[ "$(licenca_url)" == "$LICENCA_URL" ]]');
    expect(r.status).toBe(0);
  });
  it("permite continuar somente após licença válida quando configurada", () => {
    const r = run(`curl() { printf '{"valida":true}'; }; validar_licenca exemplo.invalid; echo autorizado`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("autorizado");
  });
  it("recusa licença inválida quando configurada", () => {
    const r = run(`curl() { printf '{"valida":false}'; }; validar_licenca exemplo.invalid; echo autorizado`);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain("autorizado");
  });
  it("recusa instalação/atualização sem chave quando configurada", () => {
    const r = run(`LICENCA_ARQ=/tmp/chave-ouvidesk-nao-existe; validar_licenca exemplo.invalid; echo autorizado`);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Licença não cadastrada");
    expect(r.stdout).not.toContain("autorizado");
  });
  it("não libera operação se configuração codificada estiver corrompida", () => {
    const r = run(`validar_licenca exemplo.invalid; echo autorizado`, "LICENCA_URL_B64=%%%\n");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Configuração de licença inválida");
    expect(r.stdout).not.toContain("autorizado");
  });
  it("preserva comportamento sem servidor configurado", () => {
    const r = run(`validar_licenca exemplo.invalid; echo autorizado`, "");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("autorizado");
  });
  it("indisponibilidade impede deploy sem expor endereço em log", () => {
    const r = run(`curl() { echo 'https://endpoint-privado.invalid' >&2; return 1; }; validar_licenca exemplo.invalid; echo autorizado`);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toContain("endpoint-privado");
    expect(r.stdout).not.toContain("autorizado");
  });
  it("scripts continuam com sintaxe válida", () => {
    for (const file of ["deploy.sh", "local-docker/deploy/comum.sh", "local-docker/deploy/instalar.sh", "local-docker/deploy/heartbeat-licenca.sh"]) {
      expect(() => execFileSync("bash", ["-n", file])).not.toThrow();
    }
  });
});