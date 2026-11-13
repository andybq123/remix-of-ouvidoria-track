import { requireLicencaLiberada } from "@/lib/licenca-middleware";
import { createServerFn } from "@tanstack/react-start";
import { exigirAdmin } from "./admin-guard.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { imapConfigSchema, salvarImapSchema } from "./imap-config";

export const sincronizarGmail = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { sincronizarGmailContas, sincronizarImapContas } = await import("@/lib/protocolo-ingest.server");
    const tot = { contas: 0, novos: 0, erros: 0, detalhes: [] as any[] };
    for (const fn of [sincronizarImapContas, sincronizarGmailContas]) {
      try {
        const r = await fn();
        tot.contas += r.contas; tot.novos += r.novos; tot.erros += r.erros; tot.detalhes.push(...r.detalhes);
      } catch (e: any) { tot.detalhes.push({ error: String(e?.message ?? e) }); }
    }
    return tot;
  });

export const ressincronizarGmail = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(Math.max(d?.dias ?? 30, 1), 90) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { ressincronizarGmailContas } = await import("@/lib/protocolo-ingest.server");
    return await ressincronizarGmailContas(data.dias);
  });

export const reverificarEmails = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(Math.max(d?.dias ?? 60, 1), 180) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { reverificarEmailsSemProtocolo } = await import("@/lib/protocolo-ingest.server");
    return await reverificarEmailsSemProtocolo(data.dias);
  });

export const sincronizarImap = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .handler(async ({ context }) => {
    await exigirAdmin(context);
    const { sincronizarImapContas } = await import("@/lib/protocolo-ingest.server");
    return await sincronizarImapContas();
  });

export const backfillUrls1Doc = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(Math.max(d?.dias ?? 180, 1), 365) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { backfillUrl1DocViaGmail } = await import("@/lib/protocolo-ingest.server");
    return await backfillUrl1DocViaGmail(data.dias);
  });

export const reprocessarEmail = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: { logId: string }) => ({ logId: String(d.logId) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { reprocessarEmailLog } = await import("@/lib/protocolo-ingest.server");
    return await reprocessarEmailLog(data.logId);
  });
/** Testa IMAP institucional sem persistir as credenciais. */
export const testarContaImap = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: unknown) => imapConfigSchema.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { validarConexaoImap } = await import("./imap-connection.server");
    return validarConexaoImap(data);
  });

export const salvarContaImap = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((d: unknown) => salvarImapSchema.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { validarConexaoImap } = await import("./imap-connection.server");
    await validarConexaoImap(data);
    const { adminComAutor } = await import("./audit-admin.server");
    const supabaseAdmin = adminComAutor(context.userId);
    const { error } = await (supabaseAdmin as any).rpc("salvar_conta_imap", {
      p_email: data.email, p_host: data.host, p_port: data.port, p_user: data.user,
      p_password: data.pass, p_descricao: data.descricao, p_secretaria: data.secretariaId,
      p_actor: context.userId,
    });
    if (error) throw new Error("Não foi possível salvar a conta. Confira a atualização do sistema e tente novamente.");
    return { ok: true };
  });
