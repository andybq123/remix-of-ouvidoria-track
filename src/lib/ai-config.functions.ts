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
    const { data, error } = await context.supabase
      .from("ai_config")
      .select("provider, api_key, grok_api_key, gemini_api_key, grok_model, gemini_model, priority, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    const d: any = data ?? {};
    const geminiKey: string | null = d.gemini_api_key ?? (d.provider === "gemini" ? d.api_key : null) ?? null;
    const raw: string[] = Array.isArray(d.priority) ? d.priority : [];
    const priority = [
      ...raw.filter((p): p is Prov => (KNOWN as string[]).includes(p)),
      ...KNOWN.filter((p) => !raw.includes(p)),
    ].filter((p, i, a) => a.indexOf(p) === i);
    const mask = (k: string | null) => (k ? `••••${k.slice(-4)}` : null);
    return {
      priority,
      grok: { hasKey: !!d.grok_api_key, apiKeyMasked: mask(d.grok_api_key ?? null), model: d.grok_model ?? "" },
      gemini: { hasKey: !!geminiKey, apiKeyMasked: mask(geminiKey), model: d.gemini_model ?? "" },
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
    const { error } = await context.supabase.from("ai_config").update(patch as any).eq("id", true);
    if (error) throw error;
    await invalidate();
    return { ok: true, reply };
  });

export const saveAiPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ priority: z.array(z.enum(["grok", "gemini"])).min(1).max(2) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const priority = data.priority.filter((p, i, a) => a.indexOf(p) === i);
    const { error } = await context.supabase
      .from("ai_config")
      .update({ priority, provider: priority[0], updated_at: new Date().toISOString(), updated_by: context.userId } as any)
      .eq("id", true);
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
