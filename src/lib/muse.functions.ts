import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "@/lib/admin-guard.server";
import { mascararTokenMuse, type OrigemTokenMuse } from "@/lib/muse-api.server";
import type { OnedocJob } from "@/lib/onedoc.functions";

export type MuseStatus = {
  /** Token da API Muse configurado (no sistema ou no env) — nunca o valor. */
  configurado: boolean;
  /** De onde vem o token que está valendo: sistema, env ou nenhuma. */
  origem: OrigemTokenMuse;
  /** Só os últimos 4 caracteres (mesma máscara das chaves de IA). */
  tokenMascarado: string | null;
  /** Integração pausada pelo administrador (onedoc_config.muse_pausado). */
  pausado: boolean;
  jobs: OnedocJob[];
};

/**
 * Painel Assistente Muse: status da integração e os últimos jobs
 * pedidos pelo Muse (onedoc_jobs com contexto.origem = "muse").
 * Admin-only. Sem tabela nova: o histórico é o próprio onedoc_jobs.
 */
export const getMuseStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MuseStatus> => {
    await exigirAdmin(context);
    let pausado = false;
    try {
      const { data, error } = await context.supabase
        .from("onedoc_config")
        .select("muse_pausado")
        .eq("id", true)
        .maybeSingle();
      if (!error)
        pausado = (data as { muse_pausado?: boolean | null } | null)?.muse_pausado === true;
    } catch {
      pausado = false;
    }
    const { data: jobs, error } = await context.supabase
      .from("onedoc_jobs")
      .select(
        "id,tipo,status,total,processados,atualizados,erros,mensagem,created_at,iniciado_em,finalizado_em,resultados,contexto",
      )
      .contains("contexto", { origem: "muse" })
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    // Origem do token: banco (Configurações > IA) primeiro, env depois.
    // Sem a coluna (banco sem a migração 0035/036), cai para o env.
    let origem: OrigemTokenMuse = "nenhuma";
    let tokenMascarado: string | null = null;
    try {
      const { data: cfg } = await context.supabase
        .from("ai_config")
        .select("muse_api_token")
        .eq("id", true)
        .maybeSingle();
      const db = ((cfg as { muse_api_token?: string | null } | null)?.muse_api_token ?? "").trim();
      if (db) {
        origem = "sistema";
        tokenMascarado = mascararTokenMuse(db);
      }
    } catch {
      /* sem coluna: tenta o env */
    }
    if (origem === "nenhuma") {
      const env = (process.env.MUSE_API_TOKEN ?? "").trim();
      if (env) {
        origem = "env";
        tokenMascarado = mascararTokenMuse(env);
      }
    }
    return {
      configurado: origem !== "nenhuma",
      origem,
      tokenMascarado,
      pausado,
      jobs: (jobs ?? []) as unknown as OnedocJob[],
    };
  });

/**
 * Liga/desliga o freio manual da integração. Com pausado=true, o
 * POST /api/public/muse/conferir-atrasadas responde 503.
 * Exige a migração 0034/035 (coluna muse_pausado em onedoc_config).
 */
export const setMusePausado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pausado: boolean }) => {
    if (typeof d?.pausado !== "boolean") throw new Error("Valor inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { error } = await context.supabase.from("onedoc_config").upsert({
      id: true,
      muse_pausado: data.pausado,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) {
      throw new Error(
        "Não foi possível salvar a pausa. Atualize o banco na VPS (migração 0034/035 — coluna muse_pausado).",
      );
    }
    return { ok: true, pausado: data.pausado };
  });
