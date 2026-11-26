import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  deveMostrarAlertaBackup,
  motivoAlertaBackup,
  validarBackupConfig,
  type BackupConfigForm,
} from "@/lib/backup-auto";

/**
 * Backup automático — server functions (só admin).
 *
 * As tabelas backup_config/backup_runs/backup_alertas não têm política
 * para anon/authenticated: todo acesso passa pelo client de serviço
 * (adminComAutor, com o cabeçalho de ator de serviço), como os demais
 * fluxos de serviço do sistema. Os segredos (JSON da conta de serviço
 * do Drive, chave secreta do S3) nunca voltam para o cliente: o painel
 * recebe só os flags tem_sa_json/tem_s3_secret e o e-mail da conta.
 */

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem configurar o backup.");
}

async function adminClient(context: any) {
  const { adminComAutor } = await import("@/lib/audit-admin.server");
  return adminComAutor(context.userId) as any;
}

type BackupConfigRow = {
  habilitado: boolean;
  intervalo_horas: number;
  manter_copias: number;
  solicitar_agora: string | null;
  destino_vps: boolean;
  vps_pasta: string;
  destino_drive: boolean;
  drive_pasta_url: string | null;
  drive_sa_json: unknown;
  drive_sa_email: string | null;
  destino_s3: boolean;
  s3_endpoint: string | null;
  s3_bucket: string | null;
  s3_regiao: string | null;
  s3_prefixo: string;
  s3_access_key: string | null;
  s3_secret_key: string | null;
  atualizado_em: string | null;
};

const CONFIG_VAZIA: BackupConfigRow = {
  habilitado: false,
  intervalo_horas: 24,
  manter_copias: 7,
  solicitar_agora: null,
  destino_vps: true,
  vps_pasta: "backups",
  destino_drive: false,
  drive_pasta_url: null,
  drive_sa_json: null,
  drive_sa_email: null,
  destino_s3: false,
  s3_endpoint: null,
  s3_bucket: null,
  s3_regiao: null,
  s3_prefixo: "ouvidesk-backups/",
  s3_access_key: null,
  s3_secret_key: null,
  atualizado_em: null,
};

async function lerConfig(admin: any): Promise<BackupConfigRow> {
  const { data, error } = await admin
    .from("backup_config")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { ...CONFIG_VAZIA, ...((data ?? {}) as Partial<BackupConfigRow>) };
}

async function ultimoBackupOk(admin: any): Promise<string | null> {
  const { data, error } = await admin
    .from("backup_runs")
    .select("finalizado_em,iniciado_em")
    .eq("status", "ok")
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data.finalizado_em as string | null) ?? (data.iniciado_em as string | null);
}

function sanitizar(row: BackupConfigRow, ultimoOk: string | null, solicitacaoPendente: boolean) {
  return {
    habilitado: row.habilitado,
    intervalo_horas: row.intervalo_horas,
    manter_copias: row.manter_copias,
    destino_vps: row.destino_vps,
    vps_pasta: row.vps_pasta,
    destino_drive: row.destino_drive,
    drive_pasta_url: row.drive_pasta_url ?? "",
    drive_sa_email: row.drive_sa_email,
    tem_sa_json: !!row.drive_sa_json,
    destino_s3: row.destino_s3,
    s3_endpoint: row.s3_endpoint ?? "",
    s3_bucket: row.s3_bucket ?? "",
    s3_regiao: row.s3_regiao ?? "",
    s3_prefixo: row.s3_prefixo,
    s3_access_key: row.s3_access_key ?? "",
    tem_s3_secret: !!row.s3_secret_key,
    atualizado_em: row.atualizado_em,
    ultimo_ok: ultimoOk,
    solicitacao_pendente: solicitacaoPendente,
  };
}

export const getBackupAutoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const admin = await adminClient(context);
    const row = await lerConfig(admin);
    const ultimoOk = await ultimoBackupOk(admin);
    const solicitacaoPendente =
      !!row.solicitar_agora && (!ultimoOk || new Date(row.solicitar_agora) > new Date(ultimoOk));
    return sanitizar(row, ultimoOk, solicitacaoPendente);
  });

const SalvarSchema = z.object({
  habilitado: z.boolean(),
  intervalo_horas: z.number().int(),
  manter_copias: z.number().int(),
  destino_vps: z.boolean(),
  vps_pasta: z.string().max(200),
  destino_drive: z.boolean(),
  drive_pasta_url: z.string().max(500),
  // JSON da conta de serviço, quando enviado (objeto já decodificado).
  drive_sa_json: z.unknown().optional(),
  limpar_drive_sa: z.boolean().optional(),
  destino_s3: z.boolean(),
  s3_endpoint: z.string().max(500),
  s3_bucket: z.string().max(200),
  s3_regiao: z.string().max(100),
  s3_prefixo: z.string().max(200),
  s3_access_key: z.string().max(200),
  // Chave secreta nova, quando trocada; omitida mantém a atual.
  s3_secret_key: z.string().max(500).optional(),
  limpar_s3_secret: z.boolean().optional(),
});

function validarServiceAccount(json: unknown): string {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("O JSON da conta de serviço é inválido.");
  }
  const j = json as Record<string, unknown>;
  const email = typeof j.client_email === "string" ? j.client_email : "";
  const chave = typeof j.private_key === "string" ? j.private_key : "";
  if (!email.includes("@") || !chave.startsWith("-----BEGIN")) {
    throw new Error("O JSON da conta de serviço não tem client_email e private_key válidos.");
  }
  return email;
}

export const salvarBackupAutoConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SalvarSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const admin = await adminClient(context);
    const atual = await lerConfig(admin);

    let driveSaJson: unknown = atual.drive_sa_json;
    let driveSaEmail: string | null = atual.drive_sa_email;
    if (data.limpar_drive_sa) {
      driveSaJson = null;
      driveSaEmail = null;
    } else if (data.drive_sa_json !== undefined) {
      driveSaEmail = validarServiceAccount(data.drive_sa_json);
      driveSaJson = data.drive_sa_json;
    }
    let s3Secret: string | null = atual.s3_secret_key;
    if (data.limpar_s3_secret) s3Secret = null;
    else if (data.s3_secret_key) s3Secret = data.s3_secret_key;

    const form: BackupConfigForm = {
      habilitado: data.habilitado,
      intervalo_horas: data.intervalo_horas,
      manter_copias: data.manter_copias,
      destino_vps: data.destino_vps,
      vps_pasta: data.vps_pasta.trim(),
      destino_drive: data.destino_drive,
      drive_pasta_url: data.drive_pasta_url.trim(),
      drive_sa_email: driveSaEmail,
      tem_sa_json: !!driveSaJson,
      destino_s3: data.destino_s3,
      s3_endpoint: data.s3_endpoint.trim(),
      s3_bucket: data.s3_bucket.trim(),
      s3_regiao: data.s3_regiao.trim(),
      s3_prefixo: data.s3_prefixo.trim() || "ouvidesk-backups/",
      s3_access_key: data.s3_access_key.trim(),
      tem_s3_secret: !!s3Secret,
    };
    const erros = validarBackupConfig(form);
    if (erros.length > 0) throw new Error(erros.join(" "));

    const { error } = await admin.from("backup_config").upsert(
      {
        id: true,
        habilitado: form.habilitado,
        intervalo_horas: form.intervalo_horas,
        manter_copias: form.manter_copias,
        destino_vps: form.destino_vps,
        vps_pasta: form.vps_pasta,
        destino_drive: form.destino_drive,
        drive_pasta_url: form.drive_pasta_url || null,
        drive_sa_json: driveSaJson,
        drive_sa_email: driveSaEmail,
        destino_s3: form.destino_s3,
        s3_endpoint: form.s3_endpoint || null,
        s3_bucket: form.s3_bucket || null,
        s3_regiao: form.s3_regiao || null,
        s3_prefixo: form.s3_prefixo,
        s3_access_key: form.s3_access_key || null,
        s3_secret_key: s3Secret,
        atualizado_em: new Date().toISOString(),
      } as any,
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const solicitarBackupAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const admin = await adminClient(context);
    const { error } = await admin
      .from("backup_config")
      .upsert({ id: true, solicitar_agora: new Date().toISOString() } as any, {
        onConflict: "id",
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listarBackupRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const admin = await adminClient(context);
    const { data, error } = await admin
      .from("backup_runs")
      .select("id,iniciado_em,finalizado_em,status,arquivo,tamanho_bytes,destinos,erro")
      .order("iniciado_em", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      iniciado_em: string;
      finalizado_em: string | null;
      status: string;
      arquivo: string | null;
      tamanho_bytes: number | null;
      destinos: string[];
      erro: string | null;
    }[];
  });

/**
 * Alerta semanal pós-login. Só administradores veem: sem backup com
 * sucesso nos últimos 7 dias (ou nunca houve) E sem alerta exibido nos
 * últimos 7 dias. Não-admin recebe mostrar=false, sem erro.
 */
export const backupAlertaLogin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { mostrar: false, motivo: null as string | null, ultimo_ok: null as string | null, dias_sem_backup: null as number | null };
    const admin = await adminClient(context);
    const ultimoOk = await ultimoBackupOk(admin);
    const { data: visto } = await admin
      .from("backup_alertas")
      .select("ultimo_alerta_em")
      .eq("admin_id", context.userId)
      .maybeSingle();
    const ultimoAlerta = (visto as { ultimo_alerta_em?: string | null } | null)?.ultimo_alerta_em ?? null;
    const mostrar = deveMostrarAlertaBackup(ultimoOk, ultimoAlerta);
    const motivo = mostrar ? motivoAlertaBackup(ultimoOk) : null;
    const dias = ultimoOk
      ? Math.floor((Date.now() - new Date(ultimoOk).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    return { mostrar, motivo, ultimo_ok: ultimoOk, dias_sem_backup: dias };
  });

export const registrarBackupAlertaVisto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false };
    const admin = await adminClient(context);
    const { error } = await admin.from("backup_alertas").upsert(
      { admin_id: context.userId, ultimo_alerta_em: new Date().toISOString() } as any,
      { onConflict: "admin_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
