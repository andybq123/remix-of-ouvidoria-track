import { createFileRoute } from "@tanstack/react-router";

import { licencaBloqueadaAdmin, respostaBloqueada } from "@/lib/licenca-guard";

import {
  museCorsHeaders,
  museTriarProtocoloBodySchema,
  validarTokenMuse,
} from "@/lib/muse-api.server";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/public/muse/protocolo/{id}/triar — triagem pelo Ouvidorzinho.
 *
 * Replica o "Concluir triagem" do painel (protocolo-detail-dialog.tsx):
 * secretaria obrigatória, descrição (breve relato) com no mínimo 5
 * caracteres, e-SIC não é triado, Obras exige endereço + ponto no mapa.
 * Não muda status (o protocolo em triagem já está "em andamento") e
 * nunca conclui, encerra ou arquiva: triagem é atribuição e só limpa
 * triagem_pendente, via RPCs da migração 0037, auditadas com autor
 * "Muse" em protocolo_historico (aba Histórico) e registro_sistema.
 *
 * `acao` (opcional, padrão "concluir"):
 * - "iniciar" — reserva o protocolo por 10 min; a lista e o detalhe
 *   passam a mostrar "Triando com o Ouvidorzinho".
 * - "concluir" — aplica secretaria/local/descrição e limpa a triagem;
 *   o detalhe mostra o card "Triado pelo Ouvidorzinho".
 * - "cancelar" — libera a reserva do Muse quando ele desiste.
 *
 * Erros: 404 protocolo inexistente; 400 e-SIC, descrição curta ou
 * Obras sem endereço/ponto; 409 já triado ou em triagem por outro
 * usuário; 422 secretaria/local inválido ou local de outra secretaria.
 */
export const Route = createFileRoute("/api/public/muse/protocolo/$id/triar")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: museCorsHeaders() }),

      POST: async ({ request, params }) => {
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

        const parsed = museTriarProtocoloBodySchema.safeParse(body);

        if (!parsed.success) {
          return Response.json(
            { error: "Payload inválido", detalhes: parsed.error.flatten() },
            { status: 400, headers: museCorsHeaders() },
          );
        }

        const { cancelarTriagemMuse, concluirTriagemMuse, iniciarTriagemMuse } = await import(
          "@/lib/muse-triagem.server"
        );
        const { musePausado } = await import("@/lib/muse-atrasadas.server");

        try {
          if (await musePausado(supabaseAdmin)) {
            return Response.json(
              { error: "Integração Muse pausada pelo administrador" },
              { status: 503, headers: museCorsHeaders() },
            );
          }

          const acao = parsed.data.acao ?? "concluir";

          if (acao === "iniciar") {
            const r = await iniciarTriagemMuse(supabaseAdmin, id);
            return Response.json(r, { headers: museCorsHeaders() });
          }

          if (acao === "cancelar") {
            const r = await cancelarTriagemMuse(supabaseAdmin, id);
            return Response.json(r, { headers: museCorsHeaders() });
          }

          const r = await concluirTriagemMuse(supabaseAdmin, id, parsed.data);
          return Response.json(r, { headers: museCorsHeaders() });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);

          if (msg === "Protocolo não encontrado") {
            return Response.json({ error: msg }, { status: 404, headers: museCorsHeaders() });
          }

          if (/e-SIC não é triado|Descrição muito curta|Endereço e ponto no mapa/.test(msg)) {
            return Response.json({ error: msg }, { status: 400, headers: museCorsHeaders() });
          }

          if (/já triado|em triagem por/.test(msg)) {
            return Response.json({ error: msg }, { status: 409, headers: museCorsHeaders() });
          }

          if (/Secretaria não encontrada|Local não encontrado|Local não pertence/.test(msg)) {
            return Response.json({ error: msg }, { status: 422, headers: museCorsHeaders() });
          }

          return Response.json({ error: msg }, { status: 500, headers: museCorsHeaders() });
        }
      },
    },
  },
});
