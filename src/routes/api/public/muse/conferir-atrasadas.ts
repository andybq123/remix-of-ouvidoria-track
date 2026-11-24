import { createFileRoute } from "@tanstack/react-router";
import { licencaBloqueadaAdmin, respostaBloqueada } from "@/lib/licenca-guard";
import { museConferirBodySchema, museCorsHeaders, validarTokenMuse } from "@/lib/muse-api.server";

/**
 * POST /api/public/muse/conferir-atrasadas — enfileira a conferência
 * das ouvidorias atrasadas no agente do 1Doc (fila onedoc_jobs).
 *
 * Não conclui nada por si só: quem lê o 1Doc e grava o resultado é o
 * agente da VPS, com a regra de baixa de parse.mjs e a RPC auditada.
 * Com simulacao:true não insere nada — só devolve o que seria enfileirado.
 */
export const Route = createFileRoute("/api/public/muse/conferir-atrasadas")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),
      POST: async ({ request }) => {
        // Token primeiro: sem ele, a resposta é 401 mesmo que o banco
        // esteja fora do ar. Só depois vêm licença e manutenção.
        // O client admin resolve o token do sistema (ai_config) ou do env.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await validarTokenMuse(request, supabaseAdmin);
        if (auth) return auth;
        // Falha de leitura da licença não bloqueia (o banco também recusa
        // gravações); só bloqueia quando a leitura confirma o bloqueio.
        try {
          if (await licencaBloqueadaAdmin()) return respostaBloqueada();
        } catch {
          /* sem leitura da licença, segue — o banco recusa se bloqueado */
        }
        const { ingestaoPausada } = await import("@/lib/import-maintenance.server");
        if (ingestaoPausada()) {
          return Response.json(
            { sucesso: false, erro: "Ingestão pausada para importação de backup" },
            { status: 503, headers: { ...museCorsHeaders(), "Retry-After": "300" } },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "JSON inválido" },
            { status: 400, headers: museCorsHeaders() },
          );
        }
        const parsed = museConferirBodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Payload inválido", detalhes: parsed.error.flatten() },
            { status: 400, headers: museCorsHeaders() },
          );
        }
        const { secretariaId, protocoloIds, simulacao } = parsed.data;

        const { listarAtrasadasMuse, selecionarPorIdsMuse, musePausado } =
          await import("@/lib/muse-atrasadas.server");
        try {
          if (await musePausado(supabaseAdmin)) {
            return Response.json(
              { error: "Integração Muse pausada pelo administrador" },
              { status: 503, headers: museCorsHeaders() },
            );
          }

          // Seleção: IDs explícitos (o que o Muse viu em GET /atrasadas)
          // ou, sem eles, a lista de atrasadas montada no servidor.
          // Nunca o lote global de abertas.
          const sel = protocoloIds
            ? await selecionarPorIdsMuse(supabaseAdmin, protocoloIds, { secretariaId })
            : await (async () => {
                const s = await listarAtrasadasMuse(supabaseAdmin, { secretariaId });
                return { elegiveis: s.elegiveis, semLink: s.semLink, secretarias: s.secretarias };
              })();

          if (!sel.elegiveis.length) {
            return Response.json(
              { error: "Nenhuma ouvidoria elegível", semLink: sel.semLink },
              { status: 422, headers: museCorsHeaders() },
            );
          }

          if (simulacao) {
            return Response.json(
              {
                simulacao: true,
                total: sel.elegiveis.length,
                semLink: sel.semLink,
                protocoloIds: sel.elegiveis.map((e) => e.id),
                numeros: sel.elegiveis.map((e) => e.numero),
              },
              { headers: museCorsHeaders() },
            );
          }

          // Trava de concorrência: um lote do Muse por vez.
          const { data: emAndamento, error: errTrava } = await supabaseAdmin
            .from("onedoc_jobs")
            .select("id")
            .eq("tipo", "lote")
            .in("status", ["pendente", "executando"])
            .contains("contexto", { origem: "muse" })
            .order("created_at", { ascending: false })
            .limit(1);
          if (errTrava) throw errTrava;
          if (emAndamento?.length) {
            return Response.json(
              { error: "Já existe conferência em andamento", jobId: emAndamento[0].id },
              { status: 409, headers: museCorsHeaders() },
            );
          }

          const ids = sel.elegiveis.map((e) => e.id);
          const { data: job, error: errInsert } = await supabaseAdmin
            .from("onedoc_jobs")
            .insert({
              tipo: "lote",
              protocolo_ids: ids,
              total: ids.length,
              contexto: { escopo: "atrasadas", origem: "muse", secretarias: sel.secretarias },
            })
            .select("id")
            .single();
          if (errInsert) throw errInsert;

          return Response.json(
            { jobId: job.id, total: ids.length, semLink: sel.semLink, simulacao: false },
            { status: 202, headers: museCorsHeaders() },
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500, headers: museCorsHeaders() });
        }
      },
    },
  },
});
