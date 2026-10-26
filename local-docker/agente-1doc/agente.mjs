// Agente 1Doc (roda só na VPS). Busca pedidos em onedoc_jobs, entra no 1Doc
// com a configuração salva no sistema e confere baixa/arquivamento de cada ouvidoria.
import { chromium } from "playwright";
import { webcrypto as wc } from "node:crypto";
import { analisarTexto1doc, atualizacaoProtocolo, precisaIA, validarRespostaIA, somenteCamposAgente, paginaDaOuvidoria, assuntoDoCatalogo } from "./parse.mjs";
import { resultadoConferencia } from "./resultado.mjs";
import { limparUrl, resolverRastreio1doc } from "./url.mjs";

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

// Endereço -> coordenadas (OpenStreetMap), restrito a Brusque/SC
async function geocodificar(endereco) {
  const q = /brusque/i.test(endereco) ? endereco : `${endereco}, Brusque, Santa Catarina`;
  const p = new URLSearchParams({ q, format: "json", limit: "1", countrycodes: "br" });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { headers: { "User-Agent": "OuviDesk-Agente1Doc/1.0", "Accept-Language": "pt-BR" } });
    if (!r.ok) return null;
    const [hit] = await r.json();
    if (!hit) return null;
    const lat = Number(hit.lat), lng = Number(hit.lon);
    // caixa aproximada do município de Brusque
    if (lat < -27.25 || lat > -26.95 || lng < -49.1 || lng > -48.75) return null;
    return { latitude: lat, longitude: lng };
  } catch { return null; } finally { await sleep(1100); }
}

// IA de reforço (Groq/Gemini configurados em Configurações → IA)
let iaCfg = null;
async function carregarIA() {
  try {
    const [c] = await rest("ai_config?select=grok_api_key,gemini_api_key,grok_model,gemini_model,priority&limit=1");
    iaCfg = c || null;
  } catch { iaCfg = null; }
}
const PROMPT = `Você lê o texto de uma ouvidoria do sistema 1Doc (prefeitura de Brusque/SC). Responda SOMENTE JSON:
{"baixado_em": "AAAA-MM-DDTHH:MM:SS-03:00" ou null, "arquivado_em": "AAAA-MM-DDTHH:MM:SS-03:00" ou null, "endereco": "logradouro, número, bairro, cidade" ou null}
baixado_em = quando o setor deu baixa/resposta final; arquivado_em = quando arquivou. endereco = local do problema relatado. Não invente: use null se não houver.`;
async function chamarIA(texto) {
  if (!iaCfg) return null;
  const ordem = (iaCfg.priority || ["grok", "gemini"]).filter((p) => p === "grok" || p === "gemini");
  for (const p of ordem.length ? ordem : ["grok", "gemini"]) {
    const key = p === "grok" ? iaCfg.grok_api_key : iaCfg.gemini_api_key;
    if (!key) continue;
    const url = p === "grok" ? "https://api.groq.com/openai/v1/chat/completions" : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    const model = p === "grok" ? (iaCfg.grok_model || "llama-3.3-70b-versatile") : (iaCfg.gemini_model || "gemini-2.5-flash");
    try {
      const r = await fetch(url, {
        method: "POST", signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [
          { role: "system", content: PROMPT }, { role: "user", content: texto.slice(-12000) }] }),
      });
      if (!r.ok) { log(`IA ${p} ${r.status}`); continue; }
      const j = await r.json();
      const c = j.choices?.[0]?.message?.content || "";
      return validarRespostaIA(JSON.parse(c.replace(/^```(json)?|```$/g, "").trim()));
    } catch (e) { log(`IA ${p} falhou: ${e?.message || e}`); }
  }
  return null;
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
  await carregarIA();
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
    const catalogo = (await rest("assuntos?select=nome&ativo=eq.true")).map((x) => x.nome);
    const ids = job.protocolo_ids || [];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const prots = await rest(`protocolos?select=id,numero,assunto,categoria,status,data_conclusao,url,endereco,latitude,longitude,secretaria_id,secretarias(nome)&id=in.(${lote.join(",")})`);
      for (const p of prots) {
        const r = { id: p.id, numero: p.numero, assunto: p.assunto ?? null, secretaria_id: p.secretaria_id, secretaria_nome: p.secretarias?.nome ?? "Sem secretaria" };
        try {
          const url = limparUrl(p.url) || await resolverRastreio1doc(p.url).catch(() => null);
          if (!url) throw new Error(p.url?.trim() ? "formato do link não reconhecido ou destino fora do 1Doc; nada foi alterado" : "ouvidoria sem link do 1Doc cadastrado; nada foi alterado");
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForTimeout(1800);
          if (await visivel(page, ['input[type="password"]'])) { await login(page, cfg); await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1800); }
          const texto = await page.evaluate(() => document.body.innerText || "");
          // Link quebrado ou de outra ouvidoria: não grava nada neste protocolo.
          if (!paginaDaOuvidoria(texto, p.numero)) throw new Error("link do 1Doc quebrado ou de outra ouvidoria; nada foi alterado");
          const a = analisarTexto1doc(texto);
          let fonte = "regra";
          if (precisaIA(texto, a, p)) {
            const ia = await chamarIA(texto);
            if (ia && (ia.baixado_em || ia.arquivado_em || ia.endereco)) {
              fonte = "ia";
              // A IA nunca conclui: só a linha "deu baixa" lida pela regra fecha o protocolo.
              a.endereco ||= ia.endereco;
            }
          }
          const upd = somenteCamposAgente(atualizacaoProtocolo(p, a));
          const assunto = assuntoDoCatalogo(texto, catalogo);
          if (assunto && assunto !== p.assunto) upd.assunto = assunto;
          if (upd.endereco || p.latitude == null || p.longitude == null) {
            // Um endereço novo nunca pode conservar o ponto do endereço antigo.
            if (upd.endereco) Object.assign(upd, { latitude: null, longitude: null });
            const end = upd.endereco || p.endereco;
            if (end) { const c = await geocodificar(end); if (c) Object.assign(upd, c); }
          }
          await rest("rpc/aplicar_conferencia_1doc", { method: "POST", body: JSON.stringify({
            p_id: p.id, p_patch: somenteCamposAgente(upd),
            p_anterior: { assunto: p.assunto, categoria: p.categoria, endereco: p.endereco, latitude: p.latitude, longitude: p.longitude, status: p.status, data_conclusao: p.data_conclusao, url: p.url },
          }) });
          if (upd.status) atualizados++;
          Object.assign(r, resultadoConferencia(p, upd, a, fonte));
        } catch (e) { erros++; r.verificado_em = new Date().toISOString(); r.erro = String(e?.message || e).slice(0, 200); }
        processados++;
        resultados.push(r);
        if (processados % 5 === 0 || processados === job.total) {
          await patch("onedoc_jobs", `id=eq.${job.id}`, { processados, atualizados, erros, resultados });
        }
        await sleep(DELAY);
      }
    }
    await patch("onedoc_jobs", `id=eq.${job.id}`, { status: "concluido", processados, atualizados, erros, resultados, finalizado_em: new Date().toISOString(), mensagem: `${processados} conferidas, ${resultados.filter((x) => x.endereco_atualizado).length} endereços atualizados, ${atualizados} concluídas, ${resultados.filter((x) => x.fonte === "ia").length} com IA, ${erros} com erro` });
  } catch (e) {
    await patch("onedoc_jobs", `id=eq.${job.id}`, { status: "erro", processados, atualizados, erros, resultados, mensagem: String(e?.message || e).slice(0, 300), finalizado_em: new Date().toISOString() });
  } finally {
    await ctx.close().catch(() => {}); await browser.close().catch(() => {});
  }
}

log("aguardando pedidos…");
// pedidos que ficaram "executando" de uma queda anterior voltam para a fila
await patch("onedoc_jobs", "status=eq.executando", { status: "pendente" }).catch(() => {});
async function licencaBloqueada() {
  try { return (await rest("rpc/licenca_bloqueada", { method: "POST", body: "{}" })) === true; }
  catch { return false; } // sem leitura não bloqueia; o banco recusa gravações de qualquer forma
}
let avisouBloqueio = false;
for (;;) {
  try {
    if (await licencaBloqueada()) {
      if (!avisouBloqueio) log("licença bloqueada: agente parado (somente consulta)");
      avisouBloqueio = true; await sleep(30000); continue;
    }
    if (avisouBloqueio) { log("licença liberada: agente retomando"); avisouBloqueio = false; }
    const [job] = await rest("onedoc_jobs?status=eq.pendente&order=created_at.asc&limit=1&select=*");
    if (job) await processar(job); else await sleep(3000);
  } catch (e) { log("erro:", e?.message || e); await sleep(10000); }
}
