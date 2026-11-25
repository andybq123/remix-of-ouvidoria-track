import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { museCorsHeaders, validarTokenMuse } from "@/lib/muse-api.server";

const QuerySchema = z.object({
  secretariaId: z.string().uuid().optional(),
  status: z.enum(["aberto", "em_andamento", "concluido"]).optional(),
  tipo: z.enum(["ouvidoria", "lai", "esic"]).optional(),
  vencendo: z.preprocess(
    (v) => (v === "true" ? true : v === "false" ? false : v),
    z.boolean().optional(),
  ),
  busca: z.string().trim().min(1).max(200).optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
  ordem: z.enum(["abertura", "prazo", "atraso"]).optional(),
});

/**
 * GET /api/public/muse/protocolos — lista genérica de protocolos, com
 * filtros combináveis e paginação. Leitura pura, não altera nada.
 *
 * Filtros: secretariaId, status, tipo, vencendo (prazo em 0..7 dias),
 * busca (número com ou sem ponto, ou texto em assunto/descrição).
 * Ordem: abertura (mais recente primeiro, padrão), prazo (prazo final
 * crescente) ou atraso (mais atrasada primeiro). Paginação: limite
 * (padrão 50, máx. 500) e offset; `total` é o total filtrado, antes
 * de paginar. Cobre também as em aberto dentro do prazo, não só as
 * atrasadas — para essas, continua existindo o GET /atrasadas.
 */
export const Route = createFileRoute("/api/public/muse/protocolos")({
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
          status: url.searchParams.get("status") ?? undefined,
          tipo: url.searchParams.get("tipo") ?? undefined,
          vencendo: url.searchParams.get("vencendo") ?? undefined,
          busca: url.searchParams.get("busca") ?? undefined,
          limite: url.searchParams.get("limite") ?? undefined,
          offset: url.searchParams.get("offset") ?? undefined,
          ordem: url.searchParams.get("ordem") ?? undefined,
        });
        if (!parsed.success) {
          return Response.json(
            { error: "Payload inválido", detalhes: parsed.error.flatten() },
            { status: 400, headers: museCorsHeaders() },
          );
        }

        const { listarProtocolosMuse } = await import("@/lib/muse-protocolos.server");
        try {
          const pagina = await listarProtocolosMuse(supabaseAdmin, {
            secretariaId: parsed.data.secretariaId,
            status: parsed.data.status,
            tipo: parsed.data.tipo,
            vencendo: parsed.data.vencendo,
            busca: parsed.data.busca,
            limite: parsed.data.limite ?? 50,
            offset: parsed.data.offset ?? 0,
            ordem: parsed.data.ordem ?? "abertura",
          });
          return Response.json(
            {
              geradoEm: new Date().toISOString(),
              total: pagina.total,
              limite: pagina.limite,
              offset: pagina.offset,
              protocolos: pagina.protocolos,
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
