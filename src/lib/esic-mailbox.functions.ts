import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "./admin-guard.server";
import { esicMailboxCursorSchema } from "./esic-mailbox";

export const rechecarEsic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => esicMailboxCursorSchema.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { rechecarLoteEsic } = await import("./esic-mailbox.server");
    return rechecarLoteEsic(data);
  });