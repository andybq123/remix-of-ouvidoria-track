// Atualiza o "mapa de arquivos" da compilação depois que o "deploy.sh atualizar" troca
// o endereço/chave do banco dentro dos arquivos. Sem isso o servidor continua
// enviando os arquivos com o tamanho antigo e o navegador recebe código cortado
// (tela em branco com "Unexpected end of input").
// Uso: node corrigir-tamanhos.mjs ../.output
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const out = path.resolve(process.argv[2] || "../.output");
const pub = path.join(out, "public");
const server = path.join(out, "server");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(mjs|js|cjs|json)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const entryRe = /"(\/[^"\s]+)"\s*:\s*\{([^{}]*?"size"\s*:\s*\d+[^{}]*?)\}/g;
let corrigidos = 0;

for (const file of walk(server)) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes('"size"')) continue;
  const novo = src.replace(entryRe, (full, url, inner) => {
    const disco = path.join(pub, decodeURIComponent(url));
    if (!disco.startsWith(pub) || !fs.existsSync(disco) || !fs.statSync(disco).isFile()) return full;
    const buf = fs.readFileSync(disco);
    const m = inner.match(/"size"\s*:\s*(\d+)/);
    if (!m || Number(m[1]) === buf.length) return full;
    const hash = crypto.createHash("sha1").update(buf).digest("base64").replace(/=+$/, "");
    const etag = `${buf.length.toString(16)}-${hash}`;
    let ni = inner.replace(/"size"\s*:\s*\d+/, `"size":${buf.length}`);
    ni = ni.replace(/"etag"\s*:\s*"\\"[^"\\]*\\""/, `"etag":"\\"${etag}\\""`);
    corrigidos++;
    return `"${url}":{${ni}}`;
  });
  if (novo !== src) fs.writeFileSync(file, novo);
}

console.log(`==> Tamanhos de ${corrigidos} arquivo(s) atualizados.`);
