import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Prov = "grok" | "gemini";
const KNOWN: Prov[] = ["grok", "gemini"];

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Acesso negado");
}

async function invalidate() {
  try {
    const mod = await import("./ai-chat.server");
    mod.invalidateAiConfigCache();
  } catch {}
}

export const getAiConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // Sem a coluna muse_api_token (banco ainda sem a migração 0035/036),
    // a seleção com ela falha — tenta de novo sem ela em vez de quebrar
    // a página inteira de IA.
    const SELECT_COM_MUSE =
      "provider, api_key, grok_api_key, gemini_api_key, grok_model, gemini_model, priority, updated_at, muse_api_token";
    const SELECT_SEM_MUSE =
      "provider, api_key, grok_api_key, gemini_api_key, grok_model, gemini_model, priority, updated_at";
    // As duas seleções têm tipos diferentes (com/sem muse_api_token);
    // usa `any` para o retry não quebrar a tipagem.
    let data: any = null;
    let error: any = null;
    const first = await context.supabase
      .from("ai_config")
      .select(SELECT_COM_MUSE)
      .eq("id", true)
      .maybeSingle();
    data = first.data;
    error = first.error;
    if (error) {
      const retry = await context.supabase
        .from("ai_config")
        .select(SELECT_SEM_MUSE)
        .eq("id", true)
        .maybeSingle();
      if (retry.error) throw retry.error;
      data = retry.data;
    }
    const d: any = data ?? {};
    const { restaurarChavesSeNecessario } = await import("./ai-keys-store.server");
    const chaves = await restaurarChavesSeNecessario({
      grok_api_key: d.grok_api_key ?? null,
      gemini_api_key: d.gemini_api_key ?? (d.provider === "gemini" ? d.api_key : null) ?? null,
      muse_api_token: d.muse_api_token ?? null,
    });
    d.grok_api_key = chaves.grok ?? null;
    const geminiKey: string | null = chaves.gemini ?? null;
    const museKey: string | null = chaves.muse ?? null;
    const raw: string[] = Array.isArray(d.priority) ? d.priority : [];
    const priority = [
      ...raw.filter((p): p is Prov => (KNOWN as string[]).includes(p)),
      ...KNOWN.filter((p) => !raw.includes(p)),
    ].filter((p, i, a) => a.indexOf(p) === i);
    const mask = (k: string | null) => (k ? `••••${k.slice(-4)}` : null);
    // Origem do token Muse: no banco (Configurações > IA) ou só no env.
    const envMuse = (process.env.MUSE_API_TOKEN ?? "").trim();
    const museOrigem: "sistema" | "env" | "nenhuma" = museKey
      ? "sistema"
      : envMuse
        ? "env"
        : "nenhuma";
    return {
      priority,
      grok: { hasKey: !!d.grok_api_key, apiKeyMasked: mask(d.grok_api_key ?? null), model: d.grok_model ?? "" },
      gemini: { hasKey: !!geminiKey, apiKeyMasked: mask(geminiKey), model: d.gemini_model ?? "" },
      muse: {
        hasKey: !!museKey,
        apiKeyMasked: mask(museKey),
        origem: museOrigem,
      },
      updatedAt: d.updated_at ?? null,
    };
  });

const ProviderInput = z.object({
  provider: z.enum(["grok", "gemini"]),
  apiKey: z.string().trim().max(500).optional(),
  clearKey: z.boolean().optional(),
  model: z.string().trim().max(120).optional(),
  validate: z.boolean().optional(),
});

/** Salva a chave/modelo de UM provedor, opcionalmente validando antes de gravar. */
export const saveAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProviderInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let reply: string | null = null;
    if (data.validate && data.apiKey && !data.clearKey) {
      const { aiTestProvider } = await import("./ai-chat.server");
      const r = await aiTestProvider(data.provider, { apiKey: data.apiKey, model: data.model || undefined });
      reply = `${r.model}: ${r.content.slice(0, 60)}`;
    }
    const patch: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: context.userId };
    const col = data.provider === "grok" ? "grok" : "gemini";
    patch[`${col}_model`] = data.model ? data.model : null;
    if (data.clearKey) patch[`${col}_api_key`] = null;
    else if (data.apiKey) patch[`${col}_api_key`] = data.apiKey;
    const { error } = await context.supabase.from("ai_config").upsert({ id: true, ...patch } as any, { onConflict: "id" });
    if (error) throw error;
    if (data.clearKey || data.apiKey) {
      const { salvarChavesArquivo } = await import("./ai-keys-store.server");
      await salvarChavesArquivo({ [col]: data.clearKey ? null : data.apiKey });
    }
    await invalidate();
    return { ok: true, reply };
  });

export const museTokenInputSchema = z
  .object({
    /** Token novo (mín. 16 caracteres — é um segredo aleatório longo). */
    apiKey: z.string().trim().min(16).max(500).optional(),
    /** Quando true, apaga o token guardado no sistema (volta a valer o env). */
    clearKey: z.boolean().optional(),
  })
  .refine((d) => d.clearKey === true || !!d.apiKey, {
    message: "Informe o token da API Muse ou use Remover para apagá-lo",
  });

/**
 * Salva ou remove o token da API Muse em Configurações > IA, na mesma
 * tabela das chaves Groq/Gemini (ai_config.muse_api_token, migração
 * 0035/036). Admin-only. Nunca devolve o valor — só { ok: true }.
 * O token guardado no sistema vence o MUSE_API_TOKEN do env.
 */
export const saveMuseToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => museTokenInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.clearKey && !data.apiKey) {
      throw new Error("Informe o token da API Muse ou use Remover para apagá-lo");
    }
    const { error } = await context.supabase.from("ai_config").upsert(
      {
        id: true,
        muse_api_token: data.clearKey ? null : (data.apiKey as string),
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      } as any,
      { onConflict: "id" },
    );
    if (error) {
      throw new Error(
        "Não foi possível salvar o token. Atualize o banco na VPS (migração 0035/036 — coluna muse_api_token).",
      );
    }
    const { salvarChavesArquivo } = await import("./ai-keys-store.server");
    await salvarChavesArquivo({ muse: data.clearKey ? null : data.apiKey });
    await invalidate();
    return { ok: true };
  });

export const saveAiPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ priority: z.array(z.enum(["grok", "gemini"])).min(1).max(2) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const priority = data.priority.filter((p, i, a) => a.indexOf(p) === i);
    const { error } = await context.supabase
      .from("ai_config")
      .upsert({ id: true, priority, provider: priority[0] === "gemini" ? "gemini" : "lovable", updated_at: new Date().toISOString(), updated_by: context.userId } as any, { onConflict: "id" });
    if (error) throw error;
    await invalidate();
    return { ok: true };
  });

/** Testa um provedor isoladamente (sem fallback para o outro). */
export const testAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: z.enum(["grok", "gemini"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { aiTestProvider } = await import("./ai-chat.server");
    const r = await aiTestProvider(data.provider);
    return { ok: true, model: r.model, reply: r.content.slice(0, 120) };
  });
