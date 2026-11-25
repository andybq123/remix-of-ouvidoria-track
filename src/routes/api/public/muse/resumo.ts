import { createFileRoute } from "@tanstack/react-router";
import { museCorsHeaders, validarTokenMuse } from "@/lib/muse-api.server";

/**
 * GET /api/public/muse/resumo — contagens operacionais dos protocolos,
 * com a mesma conta de prazo do dashboard e do chat do Ouvidorzinho
 * (resumoOperacional, em prazo.ts). Leitura pura, não altera nada.
 *
 * `atrasadas` conta os vencidos pela regra de prazo do próprio tipo;
 * `atrasadasOuvidoria` conta só as ouvidorias vencidas — o mesmo
 * número do GET /atrasadas.
 */
export const Route = createFileRoute("/api/public/muse/resumo")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),
      GET: async ({ request }) => {
        // O client admin resolve o token do sistema (ai_config) ou do env.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await validarTokenMuse(request, supabaseAdmin);
        if (auth) return auth;

        const { resumoProtocolosMuse } = await import("@/lib/muse-protocolos.server");
        try {
          const resumo = await resumoProtocolosMuse(supabaseAdmin);
          return Response.json(
            { geradoEm: new Date().toISOString(), ...resumo },
            { headers: museCorsHeaders() },
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500, headers: museCorsHeaders() });
        }
      },
    },
  },
});
