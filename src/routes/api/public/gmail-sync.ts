import { licencaBloqueadaAdmin, respostaBloqueada } from "@/lib/licenca.server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/gmail-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (await licencaBloqueadaAdmin()) return respostaBloqueada();
        const expected = [process.env.CRON_SECRET, process.env.INGEST_TOKEN].filter(Boolean) as string[];
        if (expected.length === 0) {
          return Response.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
        }
        const auth = request.headers.get("authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token || !expected.includes(token)) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const { sincronizarGmailContas } = await import("@/lib/protocolo-ingest.server");
        try {
          const r = await sincronizarGmailContas();
          return Response.json({ ok: true, ...r });
        } catch (e: any) {
          return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST para sincronizar" }),
    },
  },
});