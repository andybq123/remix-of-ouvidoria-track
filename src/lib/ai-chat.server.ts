export type AiProvider = "grok" | "gemini";

type LoadedConfig = {
  at: number;
  priority: AiProvider[];
  grokApiKey: string | null;
  geminiApiKey: string | null;
  grokModel: string | null;
  geminiModel: string | null;
  lovableModel: string | null;
};

let cached: LoadedConfig | null = null;
const TTL_MS = 30_000;

const KNOWN: AiProvider[] = ["grok", "gemini"];
function normalizePriority(input: unknown): AiProvider[] {
  const arr = Array.isArray(input) ? input : [];
  const out: AiProvider[] = [];
  for (const v of arr) {
    if (KNOWN.includes(v as AiProvider) && !out.includes(v as AiProvider)) out.push(v as AiProvider);
  }
  for (const p of KNOWN) if (!out.includes(p)) out.push(p);
  return out;
}

async function loadConfig(): Promise<LoadedConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_config")
      .select("provider, api_key, model, grok_api_key, gemini_api_key, grok_model, gemini_model, lovable_model, priority")
      .eq("id", true)
      .maybeSingle();
    const d: any = data ?? {};
    const geminiApiKey = d.gemini_api_key ?? (d.provider === "gemini" ? d.api_key : null) ?? null;
    const geminiModel = d.gemini_model ?? (d.provider === "gemini" ? d.model : null) ?? null;
    const lovableModel = d.lovable_model ?? (d.provider === "lovable" ? d.model : null) ?? null;
    const { restaurarChavesSeNecessario } = await import("./ai-keys-store.server");
    const chaves = await restaurarChavesSeNecessario({ grok_api_key: d.grok_api_key ?? null, gemini_api_key: geminiApiKey });
    cached = {
      at: Date.now(),
      priority: normalizePriority(d.priority),
      grokApiKey: chaves.grok ?? null,
      geminiApiKey: chaves.gemini ?? null,
      grokModel: d.grok_model ?? null,
      geminiModel,
      lovableModel,
    };
  } catch {
    cached = {
      at: Date.now(),
      priority: ["grok", "gemini"],
      grokApiKey: null,
      geminiApiKey: null,
      grokModel: null,
      geminiModel: null,
      lovableModel: null,
    };
  }
  return cached;
}

export function invalidateAiConfigCache() {
  cached = null;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AiChatOptions {
  messages: ChatMessage[];
  /** Optional model override; when unset uses configured model or provider default. */
  model?: string;
  responseFormat?: "json_object";
}

export type AiProviderUsed = AiProvider;

export interface AiChatResult {
  content: string;
  provider: AiProviderUsed;
  model: string;
}

/**
 * Unified chat-completion helper. Dispatches to Lovable AI Gateway or Google
 * Gemini (OpenAI-compatible endpoint) based on the row saved in public.ai_config.
 */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callGemini(apiKey: string, model: string, messages: ChatMessage[], responseFormat?: "json_object") {
  const body: any = { model, messages };
  if (responseFormat === "json_object") body.response_format = { type: "json_object" };
  return fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callGrok(apiKey: string, model: string, messages: ChatMessage[], responseFormat?: "json_object") {
  const body: any = { model, messages };
  if (responseFormat === "json_object") body.response_format = { type: "json_object" };
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function tryGemini(apiKey: string, chosen: string, messages: ChatMessage[], responseFormat?: "json_object"): Promise<AiChatResult> {
  const cascade: string[] = [];
  const push = (m: string) => { if (m && !cascade.includes(m)) cascade.push(m); };
  push(chosen);
  push("gemini-3.5-flash-lite");
  push("gemini-3.1-flash-lite");
  push("gemini-2.5-flash");
  push("gemini-2.5-flash-lite");
  push("gemini-2.0-flash");
  push("gemini-2.0-flash-lite");
  push("gemini-1.5-flash");
  push("gemini-1.5-flash-8b");
  let lastStatus = 0;
  let lastText = "";
  const transient = (s: number) => [408, 500, 502, 503, 504, 529].includes(s);
  for (const m of cascade) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await callGemini(apiKey, m, messages, responseFormat);
      if (res.ok) {
        const json = await res.json();
        return { content: json.choices?.[0]?.message?.content ?? "", provider: "gemini", model: m };
      }
      lastStatus = res.status;
      lastText = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) throw new Error("API key do Gemini inválida ou sem permissão.");
      if (res.status === 400 || res.status === 404) break;
      if (res.status === 429) {
        await sleep(Math.min(1500 * Math.pow(2, attempt) + Math.random() * 400, 12_000));
        continue;
      }
      if (transient(res.status) && attempt < 4) {
        await sleep(Math.min(800 * Math.pow(2, attempt) + Math.random() * 400, 8_000));
        continue;
      }
      break;
    }
  }
  throw new Error(`Gemini falhou após ${cascade.length} modelo(s) (status ${lastStatus}): ${lastText.slice(0, 200)}`);
}

async function tryGrok(apiKey: string, chosen: string, messages: ChatMessage[], responseFormat?: "json_object"): Promise<AiChatResult> {
  const cascade: string[] = [];
  const push = (m: string) => { if (m && !cascade.includes(m)) cascade.push(m); };
  push(chosen);
  push("llama-3.3-70b-versatile");
  push("llama-3.1-8b-instant");
  push("openai/gpt-oss-20b");
  let lastStatus = 0;
  let lastText = "";
  for (const m of cascade) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await callGrok(apiKey, m, messages, responseFormat);
      if (res.ok) {
        const json = await res.json();
        return { content: json.choices?.[0]?.message?.content ?? "", provider: "grok", model: m };
      }
      lastStatus = res.status;
      lastText = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) throw new Error("API key do Groq inválida ou sem permissão.");
      if (res.status === 400 || res.status === 404) break;
      if (res.status === 429 || [500, 502, 503, 504].includes(res.status)) {
        await sleep(800 * Math.pow(2, attempt) + Math.random() * 300);
        continue;
      }
      break;
    }
  }
  throw new Error(`Groq falhou (status ${lastStatus}): ${lastText.slice(0, 200)}`);
}

export async function aiChatDetailed({ messages, model, responseFormat }: AiChatOptions): Promise<AiChatResult> {
  const cfg = await loadConfig();
  const errors: string[] = [];
  for (const p of cfg.priority) {
    try {
      if (p === "grok") {
        const key = cfg.grokApiKey?.trim();
        if (!key) { errors.push("groq: sem API key"); continue; }
        return await tryGrok(key, model || cfg.grokModel || "llama-3.3-70b-versatile", messages, responseFormat);
      }
      if (p === "gemini") {
        const key = cfg.geminiApiKey?.trim();
        if (!key) { errors.push("gemini: sem API key"); continue; }
        return await tryGemini(key, model || cfg.geminiModel || "gemini-2.5-flash", messages, responseFormat);
      }
    } catch (e: any) {
      errors.push(`${p}: ${e?.message ?? "erro"}`);
      continue;
    }
  }
  throw new Error(`Todas as IAs falharam. ${errors.join(" | ")}`);
}

export async function aiChat(opts: AiChatOptions): Promise<string> {
  const r = await aiChatDetailed(opts);
  return r.content;
}

/** Testa um provedor específico (sem fallback), usando a chave salva ou uma chave informada. */
export async function aiTestProvider(provider: AiProvider, override?: { apiKey?: string; model?: string }): Promise<AiChatResult> {
  invalidateAiConfigCache();
  const cfg = await loadConfig();
  const messages: ChatMessage[] = [
    { role: "system", content: "Responda apenas com a palavra: OK" },
    { role: "user", content: "ping" },
  ];
  if (provider === "grok") {
    const key = (override?.apiKey || cfg.grokApiKey || "").trim();
    if (!key) throw new Error("Groq sem API key cadastrada.");
    return await tryGrok(key, override?.model || cfg.grokModel || "llama-3.3-70b-versatile", messages);
  }
  const key = (override?.apiKey || cfg.geminiApiKey || "").trim();
  if (!key) throw new Error("Gemini sem API key cadastrada.");
  return await tryGemini(key, override?.model || cfg.geminiModel || "gemini-2.5-flash", messages);
}
