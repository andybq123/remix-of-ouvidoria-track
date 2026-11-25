import { createFileRoute } from "@tanstack/react-router";
import { licencaBloqueadaAdmin, respostaBloqueada } from "@/lib/licenca-guard";
import {
  museCorsHeaders,
  museEditarProtocoloBodySchema,
  validarTokenMuse,
} from "@/lib/muse-api.server";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/public/muse/protocolo/{id} — detalhe completo de um protocolo.
 * PATCH /api/public/muse/protocolo/{id} — atualiza campos seguros
 * (endereco, latitude, longitude, assunto, descricao, solicitante,
 * categoria, secretaria_id, local_id), os mesmos que o painel deixa
 * editar no detalhe do protocolo.
 *
 * O PATCH grava via RPC aplicar_edicao_muse (migração 0036) e a mudança
 * é auditada pelo trigger log_protocolo_changes em protocolo_historico,
 * com autor "Muse" — a mesma auditoria da edição do painel e da
 * conferência do 1Doc. O PATCH nunca altera status, data_conclusao,
 * tipo, numero ou prazo: concluir, encerrar ou arquivar continua
 * sendo só o agente do 1Doc, com a regra de baixa. Nada destrutivo.
 */
export const Route = createFileRoute("/api/public/muse/protocolo/$id")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await validarTokenMuse(request, supabaseAdmin);
        if (auth) return auth;

        const id = params.id;
        if (!UUID_RE.test(id)) {
          return Response.json(
            { error: "Protocolo não encontrado" },
            { status: 404, headers: museCorsHeaders() },
          );
        }

        const { buscarProtocoloMuse } = await import("@/lib/muse-protocolos.server");
        try {
          const protocolo = await buscarProtocoloMuse(supabaseAdmin, id);
          if (!protocolo) {
            return Response.json(
              { error: "Protocolo não encontrado" },
              { status: 404, headers: museCorsHeaders() },
            );
          }
          return Response.json(protocolo, { headers: museCorsHeaders() });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500, headers: museCorsHeaders() });
        }
      },
      PATCH: async ({ request, params }) => {
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

        const id = params.id;
        if (!UUID_RE.test(id)) {
          return Response.json(
            { error: "Protocolo não encontrado" },
            { status: 404, headers: museCorsHeaders() },
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
        const parsed = museEditarProtocoloBodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Payload inválido", detalhes: parsed.error.flatten() },
            { status: 400, headers: museCorsHeaders() },
          );
        }

        const { aplicarEdicaoMuse } = await import("@/lib/muse-protocolos.server");
        const { musePausado } = await import("@/lib/muse-atrasadas.server");
        try {
          if (await musePausado(supabaseAdmin)) {
            return Response.json(
              { error: "Integração Muse pausada pelo administrador" },
              { status: 503, headers: museCorsHeaders() },
            );
          }

          const r = await aplicarEdicaoMuse(supabaseAdmin, id, parsed.data);
          return Response.json(
            {
              id: r.protocolo.id,
              numero: r.protocolo.numero,
              enderecoAnterior: r.enderecoAnterior,
              camposAlterados: r.camposAlterados,
              protocolo: r.protocolo,
            },
            { headers: museCorsHeaders() },
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "Protocolo não encontrado") {
            return Response.json({ error: msg }, { status: 404, headers: museCorsHeaders() });
          }
          if (/Secretaria não encontrada|Local não encontrado/.test(msg)) {
            return Response.json({ error: msg }, { status: 422, headers: museCorsHeaders() });
          }
          return Response.json({ error: msg }, { status: 500, headers: museCorsHeaders() });
        }
      },
    },
  },
});
