import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/vps-stats — estatísticas da VPS coletadas no host (1x/min).
 *
 * Rota interna (não pública): exige sessão de usuário administrador.
 * O cliente envia o access token do Supabase em `Authorization: Bearer`,
 * validado aqui com o client admin; sem token ou sem papel admin, 401/403.
 * Sem CORS: a página chama a rota na mesma origem.
 * Quando o coletor ainda não escreveu o JSON, devolve 200 com
 * `disponivel: false` e a página mostra "coletando…".
 */
export const Route = createFileRoute("/api/vps-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
          _user_id: data.user.id,
          _role: "admin",
        });
        if (!isAdmin) {
          return Response.json({ error: "Acesso restrito a administradores" }, { status: 403 });
        }
        const { lerEstatisticasVps } = await import("@/lib/vps-stats.server");
        const resposta = await lerEstatisticasVps();
        return Response.json(resposta);
      },
    },
  },
});
