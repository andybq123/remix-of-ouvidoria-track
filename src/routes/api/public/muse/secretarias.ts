import { createFileRoute } from "@tanstack/react-router";
import { museCorsHeaders, validarTokenMuse } from "@/lib/muse-api.server";

/**
 * GET /api/public/muse/secretarias — id, nome e sigla de cada
 * secretaria, por nome. Leitura pura, não altera nada. Serve para
 * filtrar as outras rotas sem precisar saber o UUID antes.
 */
export const Route = createFileRoute("/api/public/muse/secretarias")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),
      GET: async ({ request }) => {
        // O client admin resolve o token do sistema (ai_config) ou do env.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await validarTokenMuse(request, supabaseAdmin);
        if (auth) return auth;

        const { listarSecretariasMuse } = await import("@/lib/muse-protocolos.server");
        try {
          const secretarias = await listarSecretariasMuse(supabaseAdmin);
          return Response.json(
            {
              geradoEm: new Date().toISOString(),
              total: secretarias.length,
              secretarias,
            },
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
