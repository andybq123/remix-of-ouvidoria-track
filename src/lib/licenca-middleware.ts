import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertLicencaLiberada } from "./licenca-guard";

/** Recusa a chamada quando a licença está bloqueada (somente consulta). */
export const requireLicencaLiberada = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    await assertLicencaLiberada(context.supabase);
    return next();
  });
