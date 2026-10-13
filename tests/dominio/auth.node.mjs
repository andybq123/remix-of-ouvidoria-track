import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { configAuth, nomeAuth, snapshotAuth, aplicarAuth, restaurarAuth, verificarRollback, dockerAPI } from '../../local-docker/manutencao/dominio-auth.mjs';

function fixture() {
  return { Id: 'original-id', Name: '/supabase_auth_seta-local', Image: 'sha256:imagem-imutavel',
    State: { Running: true }, Config: { Image: 'public.ecr.aws/supabase/gotrue:v2', Cmd: ['auth'], Entrypoint: ['entrypoint'], User: '1000', Labels: { owner: 'supabase' }, Hostname: 'old-id',
      Env: ['GOTRUE_DB_DATABASE_URL=postgres://user:SECRET@db:5432/postgres', 'GOTRUE_SITE_URL=https://old.example.com', 'GOTRUE_URI_ALLOW_LIST=https://old.example.com/path,https://custom.example.com/cb', 'API_EXTERNAL_URL=https://old.example.com', 'GOTRUE_JWT_SECRET=JWT_SECRET', 'GOTRUE_SMTP_PASS=SMTP_SECRET'],
      Healthcheck: { Test: ['CMD', 'health'], Interval: 1000000000 }, Volumes: { '/state': {} } },
    HostConfig: { AutoRemove: false, NetworkMode: 'supabase_network_seta-local', RestartPolicy: { Name: 'always' }, Binds: [], Mounts: [], CapDrop: ['ALL'], PortBindings: {} },
    NetworkSettings: { Networks: { supabase_network_seta_local: { Aliases: ['auth', 'supabase_auth_seta-local'], IPAddress: '172.19.0.2', EndpointID: 'ep-id' } } },
    Mounts: [{ Type: 'volume', Name: 'auth_volume', Destination: '/state', RW: true }] };
}
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seta-auth-test-'));
  const backup = path.join(dir, 'domain-test'); fs.mkdirSync(backup);
  fs.mkdirSync(path.join(dir, 'local-docker/supabase'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'local-docker/supabase/config.toml'), 'project_id = "seta-local"\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, backup };
}
function mockDocker(failAt = '') {
  const original = fixture(); const containers = new Map([[original.Id, original]]); const calls = [];
  const api = async (method, url, body) => {
    calls.push({ method, url, body: structuredClone(body) });
    if (failAt && url.includes(failAt)) { failAt = ''; throw new Error('falha simulada'); }
    if (url.startsWith('/containers/create?')) {
      const item = { ...fixture(), Id: 'new-id', Name: '/supabase_auth_seta-local', State: { Running: false }, Config: body, HostConfig: body.HostConfig };
      containers.set(item.Id, item); return { Id: item.Id };
    }
    const key = url.split('/')[2]?.split('?')[0];
    const item = [...containers.values()].find(x => x.Id === key || x.Name === '/' + key);
    if (!item) throw new Error('404 simulado');
    if (url.endsWith('/json')) return structuredClone(item);
    if (url.includes('/stop')) item.State.Running = false;
    else if (url.includes('/start')) item.State.Running = true;
    else if (url.includes('/rename?')) item.Name = '/' + url.split('name=')[1];
    else if (url.endsWith('/update')) Object.assign(item.HostConfig, body);
    else if (method === 'DELETE') containers.delete(item.Id);
    else throw new Error('chamada não reconhecida');
    return {};
  };
  return { api, containers, calls };
}

test('clona autenticação sem alterar credenciais, imagem, segurança, callbacks terceiros ou volumes', () => {
  const source = fixture(); const original = structuredClone(source); const config = configAuth(source, 'new.example.com');
  assert.deepEqual(source, original);
  assert.equal(config.Image, source.Image);
  assert.deepEqual(config.Healthcheck, source.Config.Healthcheck);
  assert.deepEqual(config.HostConfig.CapDrop, source.HostConfig.CapDrop);
  assert.ok(config.HostConfig.Binds.includes('auth_volume:/state:rw'));
  const env = config.Env.join('\n');
  assert.ok(env.includes('GOTRUE_JWT_SECRET=JWT_SECRET') && env.includes('GOTRUE_SMTP_PASS=SMTP_SECRET'));
  assert.ok(env.includes('postgres://user:SECRET@db:5432/postgres'));
  assert.ok(env.includes('GOTRUE_SITE_URL=https://new.example.com'));
  assert.ok(env.includes('https://new.example.com/path,https://custom.example.com/cb'));
  assert.ok(!JSON.stringify(config.NetworkingConfig).includes('172.19.0.2'));
  assert.equal(nomeAuth('project_id = "seta-local"\n'), 'supabase_auth_seta-local');
  assert.throws(() => configAuth({ ...source, State: { Running: false } }, 'x.example.com'));
});
test('troca e rollback preservam contêiner original e jamais removem volumes/banco', async t => {
  const { dir, backup } = sandbox(t); const { api, containers, calls } = mockDocker();
  await snapshotAuth(api, dir, backup, 'new.example.com');
  assert.equal(fs.statSync(path.join(backup, 'auth-inspect.json')).mode & 0o777, 0o600);
  await aplicarAuth(api, backup);
  assert.equal(containers.get('original-id').State.Running, false);
  assert.equal(containers.get('original-id').HostConfig.RestartPolicy.Name, 'no');
  assert.equal(containers.get('new-id').State.Running, true);
  await verificarRollback(api, backup);
  await restaurarAuth(api, backup);
  assert.equal(containers.size, 1);
  assert.equal(containers.get('original-id').Name, '/supabase_auth_seta-local');
  assert.equal(containers.get('original-id').State.Running, true);
  assert.equal(containers.get('original-id').HostConfig.RestartPolicy.Name, 'always');
  assert.deepEqual(containers.get('original-id').Config.Env, fixture().Config.Env);
  assert.ok(calls.filter(c => c.method === 'DELETE').every(c => c.url.endsWith('?v=false')));
  assert.ok(calls.every(c => !c.url.includes('/volumes') && !c.url.includes('supabase_db')));
  await restaurarAuth(api, backup); // idempotência
});
for (const failAt of ['/stop', '/rename?', '/containers/create?', '/new-id/start']) {
  test(`restaura original após falha em ${failAt}`, async t => {
    const { dir, backup } = sandbox(t); const { api, containers } = mockDocker(failAt);
    await snapshotAuth(api, dir, backup, 'new.example.com');
    await assert.rejects(aplicarAuth(api, backup), /simulada/);
    await verificarRollback(api, backup);
    await restaurarAuth(api, backup);
    assert.equal(containers.size, 1);
    assert.equal(containers.get('original-id').Name, '/supabase_auth_seta-local');
    assert.equal(containers.get('original-id').State.Running, true);
    assert.equal(containers.get('original-id').HostConfig.RestartPolicy.Name, 'always');
  });
}
test('não destrói contêiner desconhecido que ocupa o nome esperado', async t => {
  const { dir, backup } = sandbox(t); const { api, containers, calls } = mockDocker();
  await snapshotAuth(api, dir, backup, 'new.example.com'); await aplicarAuth(api, backup);
  const stranger = { ...fixture(), Id: 'stranger-id' };
  containers.delete('new-id'); containers.set(stranger.Id, stranger);
  await assert.rejects(verificarRollback(api, backup), /substituído/);
  await assert.rejects(restaurarAuth(api, backup), /recusado/);
  assert.ok(containers.has('stranger-id'));
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 0);
});
test('negocia API Docker por socket local e não inclui segredos em mensagens de erro', async t => {
  const { dir } = sandbox(t); const socket = path.join(dir, 'docker.sock'); const received = [];
  const server = http.createServer((req, res) => {
    received.push(req.url); res.setHeader('Content-Type', 'application/json');
    if (req.url === '/version') res.end('{"ApiVersion":"1.52"}');
    else if (req.url === '/v1.52/containers/auth/json') res.end('{"Id":"auth"}');
    else { res.statusCode = 500; res.end('{"message":"SECRET should not leak"}'); }
  });
  await new Promise(resolve => server.listen(socket, resolve));
  try {
    const api = dockerAPI(socket);
    assert.equal((await api('GET', '/containers/auth/json')).Id, 'auth');
    await assert.rejects(api('POST', '/containers/auth/start'), e => !e.message.includes('SECRET') && e.message.includes('HTTP 500'));
    assert.equal(received.filter(x => x === '/version').length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
