import { licencaBloqueadaAdmin, respostaBloqueada } from "@/lib/licenca-guard";
import { createFileRoute } from "@tanstack/react-router";
import { ingerirEmail } from "@/lib/protocolo-ingest.server";

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function processInbound(token: string, request: Request) {
  if (await licencaBloqueadaAdmin()) return respostaBloqueada();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let payload: any = {};
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) payload = await request.json();
    else if (ct.includes("form")) {
      const fd = await request.formData();
      payload = Object.fromEntries(fd.entries());
    } else {
      const txt = await request.text();
      try { payload = JSON.parse(txt); } catch { payload = { text: txt }; }
    }
  } catch { payload = {}; }

  const remetente = String(payload.from ?? payload.sender ?? payload.From ?? "");
  const destinatario = String(payload.to ?? payload.recipient ?? payload.To ?? "");
  const assunto = String(payload.subject ?? payload.Subject ?? "");
  const textoBruto = String(payload.text ?? payload["body-plain"] ?? payload.plain ?? "");
  const html = String(payload.html ?? payload["body-html"] ?? payload.Html ?? "");
  const corpo = textoBruto.trim() || (html ? stripHtml(html) : "");

  const { data: account } = await supabaseAdmin
    .from("email_inbox_accounts").select("*").eq("token", token).maybeSingle();

  if (!account) return Response.json({ ok: false, error: "token inválido" }, { status: 404 });
  if (!account.ativo) {
    return Response.json({ ok: false, error: "conta inativa" }, { status: 200 });
  }

  const { ingestaoPausada } = await import("@/lib/import-maintenance.server");
  if (ingestaoPausada()) return Response.json({ ok: false, error: "Ingestão pausada para importação de backup" }, { status: 503, headers: { "Retry-After": "300" } });
  const res = await ingerirEmail({ account, remetente, destinatario, assunto, corpo });
  return Response.json(res, { status: res.ok ? 200 : 500 });
}

export const Route = createFileRoute("/api/public/inbound-email/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => processInbound(params.token, request),
      GET: async () => Response.json({ ok: true }),
    },
  },
});
