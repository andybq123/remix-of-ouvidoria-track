import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validarDominio, planoEnv, lerEnv, substituirSite, siteCaddy, atualizarArtefato } from '../../local-docker/manutencao/dominio-config.mjs';

const old = `old.example.com {
  encode gzip
  @supabase path /auth/v1/* /rest/v1/* /realtime/v1/* /storage/v1/* /functions/v1/*
  reverse_proxy @supabase 127.0.0.1:54321
  reverse_proxy 127.0.0.1:8080
}`;
const global = '{\n  email admin@example.com\n}\n';
const other = '\nother.example.com {\n  respond "texto com {placeholder} e # comentário"\n}\n';
function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seta-domain-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('valida e normaliza domínio; recusa injeção, IP, URL e porta', () => {
  assert.equal(validarDominio('  Ouvidoria.Example.COM.  '), 'ouvidoria.example.com');
  for (const bad of ['https://a.example.com', '1.2.3.4', 'x.com:443', 'a.com/path', 'a.com\n{', '*.com', 'localhost', '-a.com', 'a..com', 'ã.com', 'a'.repeat(64) + '.com']) assert.throws(() => validarDominio(bad));
});
test('altera somente URL pública/domínio/mode e preserva literalmente credenciais', () => {
  const original = '# configuração local\nAPP_DOMAIN=old.example.com\nVITE_SUPABASE_URL="https://old.example.com"\nVITE_SUPABASE_PUBLISHABLE_KEY="token=publico"\nSUPABASE_URL=http://host.docker.internal:54321\nSUPABASE_SERVICE_ROLE_KEY="secreto=valor#mais"\nCRON_SECRET=cron_token\nINGEST_TOKEN=ingest_token\n';
  const result = planoEnv(original, 'new.example.com', 'laranja');
  const before = lerEnv(original); const after = lerEnv(result.text);
  for (const key of Object.keys(before).filter(k => !['APP_DOMAIN', 'VITE_SUPABASE_URL'].includes(k))) assert.equal(after[key], before[key]);
  assert.ok(result.text.includes('SUPABASE_SERVICE_ROLE_KEY="secreto=valor#mais"'));
  assert.equal(after.VITE_SUPABASE_URL, 'https://new.example.com');
  assert.equal(after.SETA_PROXY_MODE, 'laranja');
  assert.throws(() => planoEnv(original + 'APP_DOMAIN=second.example.com\n', 'new.example.com', 'cinza'), /duplicada/);
  assert.throws(() => planoEnv(original.replace('APP_DOMAIN=old', 'APP_DOMAIN=other'), 'new.example.com', 'cinza'), /divergem/);
});
test('preserva bloco global e outros sites com chaves em strings e comentários', () => {
  const source = global + '# comentário { }\n' + old + other;
  const result = substituirSite(source, 'old.example.com', 'new.example.com', 'cinza');
  assert.ok(result.startsWith(global + '# comentário { }\n'));
  assert.ok(result.endsWith(other));
  assert.ok(result.includes('new.example.com {'));
  assert.ok(!result.includes('old.example.com {'));
});
test('recusa bloco compartilhado, personalizado, domínio ocupado e blocos ambíguos', () => {
  assert.throws(() => substituirSite(old.replace('old.example.com {', 'old.example.com, alias.example.com {'), 'old.example.com', 'new.example.com', 'cinza'));
  assert.throws(() => substituirSite(old.replace('encode gzip', 'encode gzip\n basicauth {\n user hash\n }'), 'old.example.com', 'new.example.com', 'cinza'), /personalizações/);
  assert.throws(() => substituirSite(old + '\nnew.example.com {\n respond "outro"\n}', 'old.example.com', 'new.example.com', 'cinza'), /outro bloco/);
  assert.throws(() => substituirSite(old + '\n' + old, 'old.example.com', 'new.example.com', 'cinza'));
  assert.throws(() => substituirSite('import outros.caddy\n', 'old.example.com', 'new.example.com', 'cinza'));
  assert.throws(() => substituirSite(siteCaddy('old.example.com', 'cinza').replace('encode gzip', 'encode gzip\n header X-Custom value'), 'old.example.com', 'new.example.com', 'cinza'), /personalizado/);
});
test('permite novas trocas de domínio/modo em bloco gerenciado intacto', () => {
  const source = global + siteCaddy('old.example.com', 'laranja') + other;
  assert.equal(substituirSite(source, 'old.example.com', 'new.example.com', 'cinza'), global + siteCaddy('new.example.com', 'cinza') + other);
  assert.equal(substituirSite(global + old + other, 'old.example.com', 'old.example.com', 'laranja'), global + siteCaddy('old.example.com', 'laranja') + other);
});
test('Caddy real valida ambos modos, rotas e ausência de confiança irrestrita em headers', t => {
  const dir = temp(t);
  for (const mode of ['laranja', 'cinza']) {
    const file = path.join(dir, 'Caddyfile'); fs.writeFileSync(file, global + siteCaddy('new.example.com', mode) + other);
    execFileSync('caddy', ['validate', '--config', file, '--adapter', 'caddyfile'], { stdio: 'pipe' });
    const config = JSON.parse(execFileSync('caddy', ['adapt', '--config', file, '--adapter', 'caddyfile'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const serialized = JSON.stringify(config);
    assert.ok(serialized.includes('127.0.0.1:54321') && serialized.includes('127.0.0.1:8080'));
    assert.ok(serialized.includes('no-store'));
    assert.ok(!serialized.includes('trusted_proxies'));
    if (mode === 'laranja') {
      assert.ok(serialized.includes('remote_ip'));
      assert.ok(serialized.includes('CF-Connecting-IP'));
      const policy = config.apps.tls.automation.policies.find(p => p.subjects.includes('new.example.com'));
      assert.equal(policy.issuers[0].challenges['tls-alpn'].disabled, true);
    }
  }
});
test('edita bundle sem trocar origem prefixada, remove precompressão e corrige Content-Length', t => {
  const dir = temp(t); const pub = path.join(dir, 'public/assets'); const server = path.join(dir, 'server');
  fs.mkdirSync(pub, { recursive: true }); fs.mkdirSync(server);
  const js = path.join(pub, 'app.js');
  const before = 'https://old.example.com/rest/v1 https://old.example.com.evil.test/x "https://old.example.com"';
  fs.writeFileSync(js, before); fs.writeFileSync(js + '.gz', 'stale'); fs.writeFileSync(js + '.br', 'stale');
  fs.writeFileSync(path.join(dir, 'VERSION'), 'commit-original\n');
  fs.writeFileSync(path.join(server, 'index.mjs'), `export default {"/assets/app.js":{"size":${Buffer.byteLength(before)},"etag":"\\\"old\\\""}};`);
  assert.equal(atualizarArtefato(dir, 'https://old.example.com', 'https://new-long.example.com'), 1);
  const updated = fs.readFileSync(js, 'utf8');
  assert.ok(updated.includes('https://old.example.com.evil.test/x'));
  assert.ok(updated.includes('https://new-long.example.com/rest/v1'));
  assert.ok(!fs.existsSync(js + '.gz') && !fs.existsSync(js + '.br'));
  execFileSync(process.execPath, ['local-docker/corrigir-tamanhos.mjs', dir], { cwd: path.resolve(import.meta.dirname, '../..'), stdio: 'pipe' });
  const manifest = fs.readFileSync(path.join(server, 'index.mjs'), 'utf8');
  assert.ok(manifest.includes(`"size":${Buffer.byteLength(updated)}`));
  assert.equal(fs.readFileSync(path.join(dir, 'VERSION'), 'utf8'), 'commit-original\n');
});
test('artefato não reconhecido ou com symlink aborta sem editar alvo externo', t => {
  const dir = temp(t); fs.writeFileSync(path.join(dir, 'index.mjs'), 'no url');
  assert.throws(() => atualizarArtefato(dir, 'https://old.example.com', 'https://new.example.com'), /não encontrada/);
  const target = path.join(dir, 'outside'); fs.writeFileSync(target, 'secreto');
  fs.symlinkSync(target, path.join(dir, 'link.js'));
  assert.throws(() => atualizarArtefato(dir, 'a', 'b'), /simbólicos/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'secreto');
});
