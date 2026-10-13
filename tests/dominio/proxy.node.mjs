import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { siteCaddy } from '../../local-docker/manutencao/dominio-config.mjs';

async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

test('Caddy real: preserva IP do visitante confiável e não aceita spoof da origem direta', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seta-proxy-test-'));
  const backend = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.headers)); });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  try {
    for (const trusted of [false, true]) {
      const source = path.join(dir, 'Caddyfile'); fs.writeFileSync(source, siteCaddy('new.example.com', 'laranja'));
      const config = JSON.parse(execFileSync('caddy', ['adapt', '--config', source, '--adapter', 'caddyfile'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
      const port = await freePort(); config.admin = { disabled: true }; delete config.apps.tls;
      for (const server of Object.values(config.apps.http.servers)) {
        server.listen = [`127.0.0.1:${port}`]; server.automatic_https = { disable: true }; delete server.tls_connection_policies;
      }
      const update = obj => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.handler === 'reverse_proxy') obj.upstreams = [{ dial: `127.0.0.1:${backend.address().port}` }];
        if (Array.isArray(obj.host)) obj.host = ['127.0.0.1'];
        if (obj.remote_ip) obj.remote_ip.ranges = [trusted ? '127.0.0.1/32' : '192.0.2.0/24'];
        for (const value of Object.values(obj)) if (typeof value === 'object') update(value);
      };
      update(config); const file = path.join(dir, 'config.json'); fs.writeFileSync(file, JSON.stringify(config));
      const child = spawn('caddy', ['run', '--config', file], { stdio: 'ignore' });
      try {
        let response;
        for (let i = 0; i < 50; i++) {
          try {
            response = await fetch(`http://127.0.0.1:${port}/auth`, { headers: { 'CF-Connecting-IP': '203.0.113.22', 'X-Forwarded-For': '198.51.100.66' }, signal: AbortSignal.timeout(200) });
            break;
          } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
        }
        assert.ok(response?.ok, 'Caddy iniciou e encaminhou a requisição');
        const headers = await response.json();
        assert.equal(headers['x-forwarded-for'], trusted ? '203.0.113.22' : '127.0.0.1');
        assert.equal(headers['cf-connecting-ip'], undefined);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      } finally {
        child.kill('SIGTERM'); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
      }
    }
  } finally { await new Promise(resolve => backend.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});
