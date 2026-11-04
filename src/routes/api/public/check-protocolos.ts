import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  numeros: z.array(z.string().min(1).max(100)).max(5000),
});

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// Gera variantes equivalentes do mesmo número (com/sem separador de milhar)
function variantesNumero(n: string): string[] {
  const trim = (n || "").trim();
  if (!trim) return [];
  const [num, ano] = trim.split("/");
  if (!num || !ano) return [trim];
  const semPontos = num.replace(/\./g, "");
  const numLimpo = String(parseInt(semPontos, 10));
  const out = new Set<string>([trim, `${numLimpo}/${ano}`]);
  if (numLimpo.length > 3) {
    const comPonto = numLimpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    out.add(`${comPonto}/${ano}`);
  }
  return Array.from(out);
}

export const Route = createFileRoute("/api/public/check-protocolos")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        const expected = process.env.INGEST_TOKEN;
        if (!expected) {
          return Response.json({ error: "INGEST_TOKEN não configurado" }, { status: 500, headers: corsHeaders() });
        }
        const auth = request.headers.get("authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token || token !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
        }

        let body: unknown;
        try { body = await request.json(); } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400, headers: corsHeaders() });
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Payload inválido" }, { status: 400, headers: corsHeaders() });
        }

        const { numeros } = parsed.data;
        if (numeros.length === 0) {
          return Response.json({ existentes: [] }, { headers: corsHeaders() });
        }

        // Para cada número de entrada, geramos variantes equivalentes e
        // consultamos todas de uma vez. Se qualquer variante existir, o
        // número original é marcado como já existente.
        const todasVariantes = new Set<string>();
        const mapaVariantes = new Map<string, string[]>();
        for (const n of numeros) {
          const v = variantesNumero(n);
          mapaVariantes.set(n, v);
          for (const x of v) todasVariantes.add(x);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("protocolos")
          .select("numero")
          .neq("tipo", "esic")
          .in("numero", Array.from(todasVariantes));
        if (error) {
          return Response.json({ error: error.message }, { status: 500, headers: corsHeaders() });
        }

        const setExistentes = new Set((data || []).map((r) => r.numero));
        const existentes = numeros.filter((n) => (mapaVariantes.get(n) || [n]).some((v) => setExistentes.has(v)));

        return Response.json({ existentes }, { headers: corsHeaders() });
      },
    },
  },
});