import { licencaBloqueadaAdmin, respostaBloqueada } from "@/lib/licenca.server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/email-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (await licencaBloqueadaAdmin()) return respostaBloqueada();
        const expected = [process.env.CRON_SECRET, process.env.INGEST_TOKEN].filter(Boolean) as string[];
        if (expected.length === 0) {
          return Response.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
        }
        const auth = request.headers.get("authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token || !expected.includes(token)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { ingestaoPausada } = await import("@/lib/import-maintenance.server");
        if (ingestaoPausada()) return Response.json({ ok: false, error: "Ingestão pausada para importação de backup" }, { status: 503, headers: { "Retry-After": "300" } });
        const { sincronizarGmailContas, sincronizarImapContas } = await import(
          "@/lib/protocolo-ingest.server"
        );
        const result: any = { ok: true };
        try {
          result.gmail = await sincronizarGmailContas();
        } catch (e: any) {
          result.gmail = { error: String(e?.message ?? e) };
        }
        try {
          result.imap = await sincronizarImapContas();
        } catch (e: any) {
          result.imap = { error: String(e?.message ?? e) };
        }
        return Response.json(result);
      },
      GET: async () => Response.json({ ok: true, hint: "POST para sincronizar" }),
    },
  },
});
