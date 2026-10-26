import { requireLicencaLiberada } from "@/lib/licenca-middleware";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "./admin-guard.server";
import { esicMailboxCursorSchema, esicNumerosBuscaSchema } from "./esic-mailbox";

export const rechecarEsic = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((input: unknown) => esicMailboxCursorSchema.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { rechecarLoteEsic } = await import("./esic-mailbox.server");
    return rechecarLoteEsic(data);
  });

export const buscarEsicNumeros = createServerFn({ method: "POST" })
  .middleware([requireLicencaLiberada])
  .inputValidator((input: unknown) => esicNumerosBuscaSchema.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { buscarEsicPorNumeros } = await import("./esic-mailbox.server");
    return buscarEsicPorNumeros(data);
  });