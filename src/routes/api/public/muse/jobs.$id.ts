import { createFileRoute } from "@tanstack/react-router";
import {
  museCorsHeaders,
  resumoJobMuse,
  sanitizarResultadoJob,
  validarTokenMuse,
} from "@/lib/muse-api.server";
import type { OnedocResultado } from "@/lib/onedoc-history";

/**
 * GET /api/public/muse/jobs/{id} — status e resultado de um job pedido
 * pelo Muse. Só devolve jobs com contexto.origem = "muse"; qualquer
 * outro job responde 404, para o token não virar leitura do histórico.
 */
export const Route = createFileRoute("/api/public/muse/jobs/$id")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await validarTokenMuse(request, supabaseAdmin);
        if (auth) return auth;

        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return Response.json(
            { error: "Job não encontrado" },
            { status: 404, headers: museCorsHeaders() },
          );
        }

        try {
          const { data, error } = await supabaseAdmin
            .from("onedoc_jobs")
            .select(
              "id,tipo,status,total,processados,atualizados,erros,mensagem,created_at,iniciado_em,finalizado_em,resultados,contexto",
            )
            .eq("id", id)
            .single();
          type JobRow = {
            id: string;
            tipo: string;
            status: string;
            total: number;
            processados: number;
            atualizados: number;
            erros: number;
            mensagem: string | null;
            created_at: string;
            iniciado_em: string | null;
            finalizado_em: string | null;
            resultados: unknown;
            contexto: { origem?: string } | null;
          };
          const job = data as JobRow | null;
          if (error || !job || job.contexto?.origem !== "muse") {
            return Response.json(
              { error: "Job não encontrado" },
              { status: 404, headers: museCorsHeaders() },
            );
          }
          const resultados = (
            Array.isArray(job.resultados) ? job.resultados : []
          ) as OnedocResultado[];
          return Response.json(
            {
              id: job.id,
              tipo: job.tipo,
              status: job.status,
              total: job.total,
              processados: job.processados,
              atualizados: job.atualizados,
              erros: job.erros,
              mensagem: job.mensagem ?? null,
              created_at: job.created_at,
              iniciado_em: job.iniciado_em ?? null,
              finalizado_em: job.finalizado_em ?? null,
              resultados: resultados.map((r) =>
                sanitizarResultadoJob(r as unknown as Record<string, unknown>),
              ),
              resumo: resumoJobMuse(resultados, job.erros),
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
