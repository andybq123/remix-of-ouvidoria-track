import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "@/lib/admin-guard.server";
import { onedocInputSchema } from "@/lib/onedoc-batch";

export type OnedocJob = {
  id: string; tipo: string; status: string; total: number; processados: number;
  atualizados: number; erros: number; mensagem: string | null; created_at: string;
  iniciado_em: string | null; finalizado_em: string | null; resultados: any;
};

export const getOnedocConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { data } = await context.supabase.from("onedoc_config")
      .select("url_login, usuario, senha_cifrada, updated_at").maybeSingle();
    const { data: jobs } = await context.supabase.from("onedoc_jobs")
      .select("id, tipo, status, total, processados, atualizados, erros, mensagem, created_at, iniciado_em, finalizado_em, resultados")
      .order("created_at", { ascending: false }).limit(20);
    return {
      url_login: data?.url_login ?? "",
      usuario: data?.usuario ?? "",
      temSenha: !!data?.senha_cifrada,
      updated_at: data?.updated_at ?? null,
      jobs: (jobs ?? []) as OnedocJob[],
    };
  });

export const salvarOnedocConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url_login: string; usuario: string; senha?: string }) => {
    const url = String(d.url_login || "").trim();
    if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error("Informe um link https válido");
    if (!String(d.usuario || "").trim()) throw new Error("Informe o usuário");
    return { url_login: url, usuario: d.usuario.trim(), senha: d.senha ? String(d.senha) : undefined };
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const row: any = { id: true, url_login: data.url_login, usuario: data.usuario, updated_at: new Date().toISOString(), updated_by: context.userId };
    if (data.senha) {
      const { cifrarSenha } = await import("@/lib/onedoc-crypto.server");
      row.senha_cifrada = await cifrarSenha(data.senha);
    }
    const { error } = await context.supabase.from("onedoc_config").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enfileirarOnedoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tipo: "teste" | "unitario" | "lote"; protocoloId?: string; protocoloIds?: string[] }) => onedocInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    let ids: string[] = [];
    if (data.tipo === "unitario") {
      if (!data.protocoloId) throw new Error("Protocolo não informado");
      ids = [data.protocoloId];
    } else if (data.tipo === "lote") {
      let query = context.supabase.from("protocolos")
        .select("id").neq("status", "concluido").ilike("url", "%1doc%");
      if (data.protocoloIds) query = query.in("id", data.protocoloIds).eq("tipo", "ouvidoria");
      const { fetchAllPaginated } = await import("@/lib/fetch-all");
      const rows = await fetchAllPaginated((from, to) => query.order("id").range(from, to));
      ids = (rows ?? []).map((r: any) => r.id);
      if (!ids.length) throw new Error("Nenhuma ouvidoria em aberto com link do 1Doc");
    }
    const { data: job, error } = await context.supabase.from("onedoc_jobs")
      .insert({ tipo: data.tipo, protocolo_ids: ids, total: ids.length, criado_por: context.userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: job.id as string, total: ids.length };
  });

export const statusOnedocJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { data: job, error } = await context.supabase.from("onedoc_jobs")
      .select("id, tipo, status, total, processados, atualizados, erros, mensagem, created_at, iniciado_em, finalizado_em, resultados")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return job as OnedocJob;
  });
