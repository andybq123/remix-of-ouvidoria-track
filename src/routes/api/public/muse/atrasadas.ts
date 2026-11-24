import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { museCorsHeaders, validarTokenMuse } from "@/lib/muse-api.server";

const QuerySchema = z.object({
  secretariaId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(5000).optional(),
});

/**
 * GET /api/public/muse/atrasadas — leitura pura, não altera nada.
 * Lista as ouvidorias atrasadas elegíveis para conferência no 1Doc,
 * com a mesma regra de prazo da tela Atrasados (src/lib/prazo.ts).
 */
export const Route = createFileRoute("/api/public/muse/atrasadas")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),
      GET: async ({ request }) => {
        const auth = validarTokenMuse(request);
        if (auth) return auth;

        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          secretariaId: url.searchParams.get("secretariaId") ?? undefined,
          limite: url.searchParams.get("limite") ?? undefined,
        });
        if (!parsed.success) {
          return Response.json(
            { error: "Payload inválido", detalhes: parsed.error.flatten() },
            { status: 400, headers: museCorsHeaders() },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { listarAtrasadasMuse } = await import("@/lib/muse-atrasadas.server");
        try {
          const sel = await listarAtrasadasMuse(supabaseAdmin, {
            secretariaId: parsed.data.secretariaId,
            limite: parsed.data.limite ?? 5000,
          });
          return Response.json(
            {
              geradoEm: new Date().toISOString(),
              total: sel.elegiveis.length,
              semLink: sel.semLink,
              atrasadas: sel.elegiveis.map((a) => ({
                id: a.id,
                numero: a.numero,
                secretaria: a.secretaria,
                dataAbertura: a.dataAbertura,
                prazoFinal: a.prazoFinal,
                diasAtraso: a.diasAtraso,
                prorrogado: a.prorrogado,
                url: a.url,
              })),
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
