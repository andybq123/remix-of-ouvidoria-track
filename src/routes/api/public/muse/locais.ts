import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { museCorsHeaders, validarTokenMuse } from "@/lib/muse-api.server";

const QuerySchema = z.object({
  secretariaId: z.string().uuid().optional(),
});

/**
 * GET /api/public/muse/locais — id, nome e secretaria de cada local
 * (UBS, Farmácia etc.), por nome. Com secretariaId, só os locais
 * daquela secretaria. Leitura pura, não altera nada. Serve para
 * concluir a triagem sem precisar saber o UUID do local antes — sem
 * ele, a triagem pela API dependia do painel para descobrir o local.
 */
export const Route = createFileRoute("/api/public/muse/locais")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),
      GET: async ({ request }) => {
        // O client admin resolve o token do sistema (ai_config) ou do env.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await validarTokenMuse(request, supabaseAdmin);
        if (auth) return auth;

        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          secretariaId: url.searchParams.get("secretariaId") ?? undefined,
        });
        if (!parsed.success) {
          return Response.json(
            { error: "Payload inválido", detalhes: parsed.error.flatten() },
            { status: 400, headers: museCorsHeaders() },
          );
        }

        const { listarLocaisMuse } = await import("@/lib/muse-protocolos.server");
        try {
          const locais = await listarLocaisMuse(supabaseAdmin, parsed.data.secretariaId);
          return Response.json(
            {
              geradoEm: new Date().toISOString(),
              total: locais.length,
              locais,
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
