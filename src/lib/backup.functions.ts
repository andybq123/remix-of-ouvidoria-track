import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BACKUP_TABELAS, type BackupTabela } from "@/lib/backup-config";

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem fazer backup.");
}

function validaTabela(t: string): BackupTabela {
  if (!(BACKUP_TABELAS as readonly string[]).includes(t)) throw new Error("Tabela inválida");
  return t as BackupTabela;
}

export const backupEstadoImportacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { ingestaoPausada, restauracaoAutomaticaIaBloqueada } = await import("./import-maintenance.server");
    return { ingestaoPausada: ingestaoPausada(), iaBloqueada: restauracaoAutomaticaIaBloqueada() };
  });

export const backupExportarTabela = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tabela: string; from: number; to: number }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const tabela = validaTabela(data.tabela);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from(tabela)
      .select("*")
      .order("id", { ascending: true })
      .range(data.from, data.to);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    return { rows: (rows ?? []) as Record<string, any>[] };
  });

export const backupExportarUsuarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("backup_exportar_usuarios");
    if (error) throw new Error(`usuários: ${error.message}`);
    return { rows: (data ?? []) as Record<string, any>[] };
  });

export const backupImportarTabela = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tabela: string; rows: Record<string, any>[] }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const tabela = validaTabela(data.tabela);
    const { importarTabelaValidada } = await import("./backup-import.server");
    return importarTabelaValidada(tabela, data.rows);
  });

export const backupImportarUsuarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: Record<string, any>[] }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await (supabaseAdmin as any).rpc("backup_importar_usuarios", {
      p: data.rows,
    });
    if (error) throw new Error(`usuários: ${error.message}`);
    return r as { importados: number; pulados: number };
  });
