// Agente 1Doc (roda só na VPS). Busca pedidos em onedoc_jobs, entra no 1Doc
// com a configuração salva no sistema e confere baixa/arquivamento de cada ouvidoria.
import { chromium } from "playwright";
import { webcrypto as wc } from "node:crypto";
import { analisarTexto1doc, atualizacaoProtocolo } from "./parse.mjs";

const URL_DB = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DELAY = Math.max(300, Number(process.env.ONEDOC_DELAY_MS || 1200));
if (!URL_DB || !KEY) { console.error("[agente-1doc] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes"); process.exit(2); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(path, init = {}) {
  const r = await fetch(`${URL_DB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
const patch = (tab, filtro, body) => rest(`${tab}?${filtro}`, { method: "PATCH", body: JSON.stringify(body), headers: { Prefer: "return=minimal" } });
const log = (...a) => console.log(`[agente-1doc ${new Date().toLocaleTimeString("pt-BR")}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function decifrar(s) {
  const [iv, dados] = String(s).split(".");
  const hash = await wc.subtle.digest("SHA-256", new TextEncoder().encode("onedoc:" + KEY));
  const k = await wc.subtle.importKey("raw", hash, "AES-GCM", false, ["decrypt"]);
  const out = await wc.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64") }, k, Buffer.from(dados, "base64"));
  return new TextDecoder().decode(out);
}

function limparUrl(raw) {
  let u = String(raw || "").trim().replace(/=\r?\n/g, "").replace(/=3D/gi, "=").replace(/&amp;/gi, "&").replace(/\s+/g, "");
  try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.toString() : null; } catch { return null; }
}

async function visivel(page, sels) {
  for (const s of sels) { const l = page.locator(s).first(); try { if (await l.count() && await l.isVisible()) return s; } catch {} }
  return null;
}

async function login(page, cfg) {
  await page.goto(cfg.url_login, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);
  const u = await visivel(page, ['input[name="usuario"]', 'input[name="login"]', 'input[name="email"]', 'input[type="email"]', 'input[type="text"]']);
  const p = await visivel(page, ['input[name="senha"]', 'input[name="password"]', 'input[type="password"]']);
  if (!u || !p) return true; // já logado
  await page.fill(u, cfg.usuario);
  await page.fill(p, cfg.senha);
  const b = await visivel(page, ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Entrar")', 'button:has-text("Acessar")']);
  if (b) await page.click(b); else await page.keyboard.press("Enter");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);
  return !(await visivel(page, ['input[type="password"]']));
}

async function processar(job) {
  log(`job ${job.id} (${job.tipo}, ${job.total})`);
  await patch("onedoc_jobs", `id=eq.${job.id}`, { status: "executando", iniciado_em: new Date().toISOString() });
  const [cfg] = await rest("onedoc_config?select=url_login,usuario,senha_cifrada&limit=1");
  if (!cfg?.url_login || !cfg?.usuario || !cfg?.senha_cifrada) {
    return patch("onedoc_jobs", `id=eq.${job.id}`, { status: "erro", mensagem: "Configure link, usuário e senha do 1Doc", finalizado_em: new Date().toISOString() });
  }
  cfg.senha = await decifrar(cfg.senha_cifrada);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: "pt-BR", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const resultados = [];
  let processados = 0, atualizados = 0, erros = 0;
  try {
    const ok = await login(page, cfg);
    if (!ok) throw new Error("Login recusado pelo 1Doc (confira usuário e senha)");
    if (job.tipo === "teste") {
      return await patch("onedoc_jobs", `id=eq.${job.id}`, { status: "concluido", mensagem: "Login no 1Doc funcionou", finalizado_em: new Date().toISOString() });
    }
    const ids = job.protocolo_ids || [];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const prots = await rest(`protocolos?select=id,numero,status,url,endereco&id=in.(${lote.join(",")})`);
      for (const p of prots) {
        const r = { id: p.id, numero: p.numero };
        try {
          const url = limparUrl(p.url);
          if (!url) throw new Error("sem link válido do 1Doc");
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForTimeout(1800);
          if (await visivel(page, ['input[type="password"]'])) { await login(page, cfg); await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1800); }
          const texto = await page.evaluate(() => document.body.innerText || "");
          const a = analisarTexto1doc(texto);
          const upd = atualizacaoProtocolo(p, a);
          await patch("protocolos", `id=eq.${p.id}`, upd);
          if (upd.status) atualizados++;
          await rest("protocolo_historico", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
            protocolo_id: p.id, campo: "agente_1doc", acao: "update", autor_nome: "Agente 1Doc",
            valor_anterior: p.status, valor_novo: `${a.situacao}${a.baixado_em ? " · baixa " + a.baixado_em : ""}${a.arquivado_em ? " · arquivo " + a.arquivado_em : ""}`,
          }) }).catch(() => {});
          Object.assign(r, { situacao: a.situacao, baixado_em: a.baixado_em, arquivado_em: a.arquivado_em, concluido: !!upd.status });
        } catch (e) { erros++; r.erro = String(e?.message || e).slice(0, 200); }
        processados++;
        resultados.push(r);
        if (processados % 5 === 0 || processados === job.total) {
          await patch("onedoc_jobs", `id=eq.${job.id}`, { processados, atualizados, erros, resultados: resultados.slice(-200) });
        }
        await sleep(DELAY);
      }
    }
    await patch("onedoc_jobs", `id=eq.${job.id}`, { status: "concluido", processados, atualizados, erros, resultados: resultados.slice(-200), finalizado_em: new Date().toISOString(), mensagem: `${processados} conferidas, ${atualizados} concluídas, ${erros} com erro` });
  } catch (e) {
    await patch("onedoc_jobs", `id=eq.${job.id}`, { status: "erro", processados, atualizados, erros, resultados: resultados.slice(-200), mensagem: String(e?.message || e).slice(0, 300), finalizado_em: new Date().toISOString() });
  } finally {
    await ctx.close().catch(() => {}); await browser.close().catch(() => {});
  }
}

log("aguardando pedidos…");
// pedidos que ficaram "executando" de uma queda anterior voltam para a fila
await patch("onedoc_jobs", "status=eq.executando", { status: "pendente" }).catch(() => {});
for (;;) {
  try {
    const [job] = await rest("onedoc_jobs?status=eq.pendente&order=created_at.asc&limit=1&select=*");
    if (job) await processar(job); else await sleep(3000);
  } catch (e) { log("erro:", e?.message || e); await sleep(10000); }
}
