import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLicencaEstado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("licenca_estado")
      .select("bloqueado, motivo, verificado_em")
      .eq("id", 1)
      .maybeSingle();
    return {
      bloqueado: !!data?.bloqueado,
      motivo: (data?.motivo as string | null) ?? null,
      verificado_em: (data?.verificado_em as string | null) ?? null,
    };
  });
