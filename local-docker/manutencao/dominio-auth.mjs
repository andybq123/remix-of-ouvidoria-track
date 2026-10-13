import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validarDominio } from './dominio-config.mjs';

// Docker API local. Não usa shell, não imprime env e não reinicia o Supabase/banco.
export function dockerAPI(socket = '/var/run/docker.sock') {
  const request = (method, url, body) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ socketPath: socket, method, path: url,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Docker ${method} ${url.split('?')[0]}: HTTP ${res.statusCode}. Consulte docker logs sem publicar credenciais.`));
        try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new Error('Resposta Docker inválida.')); }
      });
    });
    req.setTimeout(45000, () => req.destroy(new Error('Tempo limite da API Docker.')));
    req.on('error', reject); if (payload) req.write(payload); req.end();
  });
  let version;
  return async (method, url, body) => {
    version ||= request('GET', '/version').then(v => {
      if (!/^1\.\d+$/.test(v.ApiVersion || '')) throw new Error('Versão da API Docker inválida.');
      return v.ApiVersion;
    });
    return request(method, `/v${await version}${url}`, body);
  };
}
export function nomeAuth(config) {
  const m = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/m);
  if (!m) throw new Error('project_id Supabase inválido ou ausente.');
  return `supabase_auth_${m[1]}`;
}
export function configAuth(inspect, domain) {
  validarDominio(domain);
  if (!inspect.State.Running || !inspect.Config.Image.includes('gotrue')) throw new Error('Contêiner de autenticação não é um GoTrue ativo reconhecido.');
  if (inspect.HostConfig.AutoRemove || inspect.HostConfig.NetworkMode === 'host' || inspect.HostConfig.NetworkMode.startsWith('container:')) throw new Error('Configuração Docker de autenticação não suportada.');
  const env = [...inspect.Config.Env];
  if (!env.some(s => s.startsWith('GOTRUE_DB_DATABASE_URL='))) throw new Error('Conexão GoTrue não reconhecida.');
  const set = (key, value) => {
    const indices = env.flatMap((v, i) => v.startsWith(`${key}=`) ? [i] : []);
    if (indices.length > 1) throw new Error('Configuração GoTrue duplicada.');
    if (indices.length) env[indices[0]] = `${key}=${value}`; else env.push(`${key}=${value}`);
  };
  // Preserva callbacks customizados de outras integrações; troca somente a origem antiga.
  const oldURL = env.find(x => x.startsWith('GOTRUE_SITE_URL='))?.slice('GOTRUE_SITE_URL='.length);
  if (!oldURL) throw new Error('GOTRUE_SITE_URL ausente.');
  const allow = env.find(x => x.startsWith('GOTRUE_URI_ALLOW_LIST='))?.slice('GOTRUE_URI_ALLOW_LIST='.length) || '';
  const oldOrigin = new URL(oldURL).origin;
  const newURL = `https://${domain}`;
  const callbacks = allow.split(',').map(s => s.trim()).filter(Boolean).map(s => s === oldOrigin || s.startsWith(oldOrigin + '/') ? newURL + s.slice(oldOrigin.length) : s);
  set('GOTRUE_SITE_URL', newURL);
  set('GOTRUE_URI_ALLOW_LIST', [...new Set([newURL, ...callbacks])].join(','));
  if (env.some(x => x.startsWith('API_EXTERNAL_URL='))) set('API_EXTERNAL_URL', newURL);
  const config = structuredClone(inspect.Config);
  config.Env = env; config.Image = inspect.Image; // ID imutável da mesma imagem já instalada.
  delete config.Hostname; delete config.Domainname;
  const host = structuredClone(inspect.HostConfig);
  delete host.ConsoleSize;
  const endpoints = {};
  for (const [network, data] of Object.entries(inspect.NetworkSettings.Networks)) {
    if (data.IPAMConfig?.IPv4Address || data.IPAMConfig?.IPv6Address) throw new Error('GoTrue com IP estático: exige manutenção manual.');
    endpoints[network] = { Aliases: data.Aliases, Links: data.Links, DriverOpts: data.DriverOpts };
  }
  if (!Object.keys(endpoints).length) throw new Error('GoTrue sem rede Docker reconhecida.');
  // Inclui volumes anônimos explicitamente: nenhum dado muda de volume na recriação.
  host.Binds ||= [];
  for (const mount of inspect.Mounts || []) {
    if (mount.Type === 'volume' && !host.Binds.some(b => b.split(':')[1] === mount.Destination) &&
      !(host.Mounts || []).some(m => m.Target === mount.Destination)) {
      host.Binds.push(`${mount.Name}:${mount.Destination}:${mount.RW ? 'rw' : 'ro'}`);
    }
  }
  return { ...config, HostConfig: host, NetworkingConfig: { EndpointsConfig: endpoints } };
}
function save(file, data) {
  const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, file);
}
export async function snapshotAuth(api, root, backup, domain) {
  const name = nomeAuth(fs.readFileSync(path.join(root, 'local-docker/supabase/config.toml'), 'utf8'));
  const inspect = await api('GET', `/containers/${name}/json`);
  const replacement = configAuth(inspect, domain);
  const state = { name, originalId: inspect.Id, oldName: `${name}_dominio_${path.basename(backup).replace(/[^a-zA-Z0-9_-]/g, '_')}`, replacement, replacementId: null, switched: false };
  save(path.join(backup, 'auth-state.json'), state);
  fs.writeFileSync(path.join(backup, 'auth-inspect.json'), JSON.stringify(inspect), { mode: 0o600 });
  return state;
}
export async function aplicarAuth(api, backup) {
  const file = path.join(backup, 'auth-state.json'); const state = JSON.parse(fs.readFileSync(file));
  const inspect = await api('GET', `/containers/${state.name}/json`);
  if (inspect.Id !== state.originalId || state.switched) throw new Error('GoTrue mudou após a pré-verificação.');
  state.switched = true; save(file, state); // Registro antes da primeira mutação, inclusive para queda de energia.
  await api('POST', `/containers/${state.originalId}/stop?t=20`);
  await api('POST', `/containers/${state.originalId}/update`, { RestartPolicy: { Name: 'no' } });
  await api('POST', `/containers/${state.originalId}/rename?name=${state.oldName}`);
  const result = await api('POST', `/containers/create?name=${state.name}`, state.replacement);
  state.replacementId = result.Id; save(file, state);
  await api('POST', `/containers/${result.Id}/start`);
  return state;
}
export async function verificarRollback(api, backup) {
  const state = JSON.parse(fs.readFileSync(path.join(backup, 'auth-state.json')));
  const original = await api('GET', `/containers/${state.originalId}/json`);
  if (state.replacementId) {
    const current = await api('GET', `/containers/${state.name}/json`);
    if (current.Id !== state.replacementId) throw new Error('GoTrue foi substituído após a troca. Revisão manual necessária.');
  } else {
    const current = await api('GET', `/containers/${state.name}/json`).catch(() => null);
    if (current && current.Id !== state.originalId) throw new Error('GoTrue desconhecido após interrupção; revisão manual necessária.');
  }
  if (!original.Id) throw new Error('GoTrue anterior não existe mais.');
  if (!['/' + state.name, '/' + state.oldName].includes(original.Name)) throw new Error('GoTrue original foi renomeado externamente.');
}
export async function restaurarAuth(api, backup) {
  const file = path.join(backup, 'auth-state.json'); const state = JSON.parse(fs.readFileSync(file));
  if (!state.switched) return;
  const original = await api('GET', `/containers/${state.originalId}/json`);
  if (state.replacementId) {
    const replacement = await api('GET', `/containers/${state.name}/json`).catch(() => null);
    if (replacement && replacement.Id !== state.replacementId) throw new Error('Outro GoTrue ocupa o nome. Rollback automático recusado.');
    if (replacement) {
      await api('POST', `/containers/${state.replacementId}/stop?t=20`);
      await api('DELETE', `/containers/${state.replacementId}?v=false`); // Nunca apagar volumes.
    }
  } else {
    // Se o create completou antes de salvar o ID, recusar remoção cega de um contêiner.
    const current = await api('GET', `/containers/${state.name}/json`).catch(() => null);
    if (current && current.Id !== state.originalId) throw new Error('Estado interrompido durante create; revise auth-state.json e o contêiner antes de restaurar.');
  }
  if (original.Name !== `/${state.name}`) await api('POST', `/containers/${state.originalId}/rename?name=${state.name}`);
  const snapshot = JSON.parse(fs.readFileSync(path.join(backup, 'auth-inspect.json')));
  await api('POST', `/containers/${state.originalId}/update`, { RestartPolicy: snapshot.HostConfig.RestartPolicy });
  await api('POST', `/containers/${state.originalId}/start`);
  state.switched = false; save(file, state);
}
async function main() {
  const [op, root, backup, domain] = process.argv.slice(2); const api = dockerAPI();
  if (op === 'snapshot') await snapshotAuth(api, root, backup, domain);
  else if (op === 'aplicar') await aplicarAuth(api, backup);
  else if (op === 'restaurar') await restaurarAuth(api, backup);
  else if (op === 'verificar-rollback') await verificarRollback(api, backup);
  else throw new Error('Operação inválida.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(`ERRO: ${e.message}`); process.exitCode = 1; });
