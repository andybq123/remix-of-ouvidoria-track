import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin } from "./admin-guard.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROTOCOLO_EXTRACT_SYSTEM, normalizarExtracao, sanitizarTextoProtocolo } from "./protocolo-extract.shared";
import { aiChat } from "./ai-chat.server";

export const extrairProtocolo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { texto: string }) => z.object({ texto: z.string().min(5).max(20000) }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const textoLimpo = sanitizarTextoProtocolo(data.texto);
    const textoFinal = textoLimpo.length >= 5 ? textoLimpo : data.texto;

    const content = await aiChat({
      messages: [
        { role: "system", content: PROTOCOLO_EXTRACT_SYSTEM },
        { role: "user", content: textoFinal },
      ],
      responseFormat: "json_object",
    });
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    return normalizarExtracao(parsed);
  });