import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export function validarDominio(input) {
  const domain = input.trim().toLowerCase().replace(/\.$/, '');
  if (domain.length > 253 || !domain.includes('.') || net.isIP(domain) ||
    !domain.split('.').every(x => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))) {
    throw new Error('Informe apenas o domínio/subdomínio (sem https://, porta ou caminho). Use punycode para nomes internacionais.');
  }
  return domain;
}
export function lerEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (Object.hasOwn(values, m[1])) throw new Error(`Variável duplicada: ${m[1]}. Revise o .env.local.`);
    values[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return values;
}
export function atualizarEnv(text, changes) {
  lerEnv(text); // Rejeita ambiguidades antes de qualquer escrita.
  for (const [key, value] of Object.entries(changes)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  }
  return text.trimEnd() + '\n';
}
// Somente chaves de configuração públicas mudam. Credenciais e URLs internas ficam intactas.
export function planoEnv(text, domain, proxy) {
  const env = lerEnv(text);
  const url = new URL(env.VITE_SUPABASE_URL || '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash || url.port) throw new Error('VITE_SUPABASE_URL não é uma origem simples suportada.');
  const oldDomain = validarDominio(env.APP_DOMAIN || url.hostname);
  if (url.hostname !== oldDomain) throw new Error('APP_DOMAIN e VITE_SUPABASE_URL divergem. Revise antes de continuar.');
  if (!env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('Chave pública Supabase ausente.');
  if (!['laranja', 'cinza'].includes(proxy)) throw new Error('Modo proxy inválido.');
  return { oldDomain, oldURL: url.origin, newURL: `https://${domain}`,
    text: atualizarEnv(text, { APP_DOMAIN: domain, VITE_SUPABASE_URL: `https://${domain}`, SETA_PROXY_MODE: proxy }) };
}
// Scanner com offsets: comentários, strings e placeholders não são blocos.
export function tokensCaddy(text) {
  const tokens = []; let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text[i] === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }
    const start = i;
    if (text[i] === '"' || text[i] === '`') {
      const quote = text[i++]; let value = '', closed = false;
      while (i < text.length) {
        if (text[i] === quote) { i++; closed = true; break; }
        if (quote === '"' && text[i] === '\\') i++;
        value += text[i++];
      }
      if (!closed) throw new Error('String incompleta no Caddyfile.');
      tokens.push({ value, start, end: i });
    } else {
      while (i < text.length && !/\s/.test(text[i])) i++;
      tokens.push({ value: text.slice(start, i), start, end: i });
    }
  }
  return tokens;
}
const CF4 = '173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22';
const CF6 = '2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32';
function backend(address, trusted) {
  return `reverse_proxy ${address} {\n          header_up -CF-Connecting-IP${trusted ? '\n          header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}' : ''}\n        }`;
}
export function siteCaddy(domain, proxy) {
  const routes = trusted => `handle @supabase {\n        ${backend('127.0.0.1:54321', trusted)}\n      }\n      handle {\n        ${backend('127.0.0.1:8080', trusted)}\n      }`;
  return `${domain} {\n  # OuviDesk: gerenciado por alterar_dominio.sh; sem alterar outros sites.\n  encode gzip\n  header Cache-Control "no-store"\n  @supabase path /auth/v1/* /rest/v1/* /realtime/v1/* /storage/v1/* /functions/v1/*\n${proxy === 'laranja' ? `  # Faixas oficiais Cloudflare (13/10/2026); não confiar em headers de origem direta.\n  @cloudflare remote_ip ${CF4} ${CF6}\n  tls {\n    issuer acme {\n      disable_tlsalpn_challenge\n    }\n  }\n  route {\n    handle @cloudflare {\n      ${routes(true)}\n    }\n    handle {\n      ${routes(false)}\n    }\n  }` : `  route {\n    ${routes(false)}\n  }`}\n}`;
}
export function substituirSite(text, oldDomain, domain, proxy) {
  const tokens = tokensCaddy(text); const blocks = [];
  let depth = 0, start = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value === '{') {
      if (depth === 0) {
        // Cabeçalho está na mesma linha que a abertura ou imediatamente antes.
        let j = i - 1;
        while (j >= 0 && !['}', '{'].includes(tokens[j].value) &&
          !text.slice(tokens[j].end, tokens[j + 1].start).includes('\n')) j--;
        start = j + 1;
        if (start === i && i > 0 && tokens[i - 1].value !== '}') start = i - 1;
      }
      depth++;
    } else if (tokens[i].value === '}') {
      depth--;
      if (depth < 0) throw new Error('Caddyfile com chaves desbalanceadas.');
      if (depth === 0) blocks.push({ headers: tokens.slice(start, tokens.findIndex(t => t.start >= tokens[start].start && t.value === '{')).map(t => t.value), start: tokens[start].start, end: tokens[i].end });
    }
  }
  if (depth) throw new Error('Caddyfile com chaves desbalanceadas.');
  const matched = blocks.filter(b => b.headers.some(h => [oldDomain, `https://${oldDomain}`, `${oldDomain},`, `https://${oldDomain},`].includes(h)));
  if (matched.length !== 1 || matched[0].headers.length !== 1 || matched[0].headers[0].endsWith(',')) {
    throw new Error('Não encontrei um único bloco Caddy exclusivo do domínio atual. Configuração compartilhada/importada exige ajuste manual.');
  }
  if (domain !== oldDomain && blocks.some(b => b !== matched[0] && b.headers.some(h => h.replace(/^https?:\/\//, '').replace(/,$/, '') === domain))) throw new Error('O novo domínio já pertence a outro bloco do Caddy.');
  const b = matched[0]; const original = text.slice(b.start, b.end);
  // Só substituir a configuração padrão do SETA ou um bloco já gerenciado.
  const originalTokens = tokensCaddy(original).map(t => t.value);
  if (original.includes('gerenciado por alterar_dominio.sh')) {
    const expected = ['laranja', 'cinza'].map(mode => tokensCaddy(siteCaddy(oldDomain, mode)).map(t => t.value));
    if (!expected.some(t => JSON.stringify(t) === JSON.stringify(originalTokens))) throw new Error('Bloco gerenciado foi personalizado. Não sobrescreverei alterações locais.');
  } else {
    const allowed = new Set([oldDomain, `https://${oldDomain}`, '{', '}', 'encode', 'gzip', 'zstd', '@supabase', 'path', '/auth/v1/*', '/rest/v1/*', '/realtime/v1/*', '/storage/v1/*', '/functions/v1/*', 'reverse_proxy', '127.0.0.1:54321', '127.0.0.1:8080',
      // Cache de arquivos estáticos criado pelo instalador (deploy.sh instalar).
      '@assets', '/assets/*', '/favicon.png', '/icons/*', 'header', 'Cache-Control',
      '"public, max-age=31536000, immutable"', 'public, max-age=31536000, immutable']);
    if (originalTokens.some(t => !allowed.has(t))) throw new Error('Bloco SETA tem personalizações não reconhecidas. Nada será sobrescrito; revise o Caddyfile manualmente.');
  }
  return text.slice(0, b.start) + siteCaddy(domain, proxy) + text.slice(b.end);
}
export function arquivos(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Artefato com links simbólicos: não é seguro editar automaticamente.');
    if (entry.isDirectory()) files.push(...arquivos(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
export function atualizarArtefato(dir, oldURL, newURL) {
  let count = 0;
  for (const file of arquivos(dir)) {
    if (!/\.(js|mjs|cjs|json|html|css|map)$/.test(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    // Evita trocar um hostname que seja só prefixo de outro.
    const escaped = oldURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '(?![a-zA-Z0-9.:-])', 'g');
    const next = src.replace(re, newURL);
    if (next !== src) {
      fs.writeFileSync(file, next); count++;
      for (const ext of ['.gz', '.br']) if (fs.existsSync(file + ext)) fs.unlinkSync(file + ext);
    }
  }
  if (oldURL !== newURL && !count) throw new Error('URL atual não encontrada no artefato. Atualize o front antes de trocar o domínio.');
  return count;
}
export async function conferirDNS(domain, ipv4) {
  if (net.isIP(ipv4) !== 4) throw new Error('Informe o IPv4 público correto da VPS.');
  const ips = await dns.resolve4(domain);
  if (!ips.length || ips.some(ip => ip !== ipv4)) throw new Error('DNS A não aponta exclusivamente para o IPv4 informado. Se estiver laranja, coloque CINZA temporariamente e aguarde a propagação.');
  try {
    if ((await dns.resolve6(domain)).length) throw new Error('Remova temporariamente o registro AAAA: o script valida a emissão HTTPS pelo IPv4, para evitar uma origem IPv6 incorreta.');
  } catch (e) { if (!['ENODATA', 'ENOTFOUND'].includes(e.code)) throw e; }
}
async function main() {
  const [op, ...args] = process.argv.slice(2);
  if (op === 'dominio') console.log(validarDominio(args[0] || ''));
  else if (op === 'atual') console.log(planoEnv(fs.readFileSync(args[0], 'utf8'), 'validacao.example.com', 'cinza').oldDomain);
  else if (op === 'dns') { await conferirDNS(...args); console.log('DNS direto conferido.'); }
  else if (op === 'preparar') {
    const [root, stage, domain, proxy, caddyfile] = args;
    const plan = planoEnv(fs.readFileSync(path.join(root, 'local-docker/.env.local'), 'utf8'), validarDominio(domain), proxy);
    fs.writeFileSync(path.join(stage, 'env.local.new'), plan.text, { mode: 0o600 });
    fs.writeFileSync(path.join(stage, 'Caddyfile.new'), substituirSite(fs.readFileSync(caddyfile, 'utf8'), plan.oldDomain, domain, proxy));
    const n = atualizarArtefato(path.join(stage, 'output-new'), plan.oldURL, plan.newURL);
    execFileSync(process.execPath, [path.join(root, 'local-docker/corrigir-tamanhos.mjs'), path.join(stage, 'output-new')], { stdio: 'inherit' });
    console.log(`Artefato preparado: ${n} arquivo(s) ajustado(s); credenciais preservadas.`);
  } else if (op === 'saude') {
    const [envFile, url] = args;
    const env = lerEnv(fs.readFileSync(envFile, 'utf8'));
    const resp = await fetch(`${url}/auth/v1/health`, { headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`Autenticação não respondeu: HTTP ${resp.status}.`);
    const data = await resp.json();
    if (!String(data.name || '').toLowerCase().includes('gotrue')) throw new Error('A rota de autenticação não respondeu como GoTrue.');
  } else throw new Error('Operação inválida.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(`ERRO: ${e.message}`); process.exitCode = 1; });
