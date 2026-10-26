import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirAdmin } from "./admin-guard.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChat } from "./ai-chat.server";

const NOMINATIM_HEADERS = {
  "User-Agent": "OuviDesk/1.0 (Ouvidoria Brusque)",
  "Accept-Language": "pt-BR",
};

type NominatimHit = { lat: string; lon: string; display_name: string };

async function geocodeQuery(q: string): Promise<NominatimHit | null> {
  const params = new URLSearchParams({
    q: `${q}, Brusque, Santa Catarina, Brasil`,
    format: "json",
    limit: "1",
    countrycodes: "br",
    addressdetails: "1",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: NOMINATIM_HEADERS,
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as NominatimHit[];
  return arr[0] ?? null;
}

async function sugerirQuery(p: {
  assunto?: string | null;
  descricao?: string | null;
  endereco?: string | null;
  solicitante?: string | null;
  secretaria?: string | null;
  local?: string | null;
  categoria?: string | null;
}): Promise<{ query: string; confianca: string } | null> {
  const system = `Você extrai a localização mais provável de uma manifestação de ouvidoria municipal em Brusque, Santa Catarina, Brasil.
Retorne APENAS JSON: {"query":"<endereço/local em Brusque-SC>","confianca":"alta"|"media"|"baixa"}.
Prefira ruas com número; senão use bairro ou ponto de referência (escola, UBS, praça). Se nada localizar, retorne {"query":"","confianca":"baixa"}.
Nunca invente endereços fora de Brusque-SC.`;
  const userMsg = [
    `Assunto: ${p.assunto || "—"}`,
    `Descrição: ${p.descricao || "—"}`,
    `Endereço informado: ${p.endereco || "—"}`,
    `Solicitante: ${p.solicitante || "—"}`,
    `Secretaria: ${p.secretaria || "—"}`,
    `Local: ${p.local || "—"}`,
    `Categoria: ${p.categoria || "—"}`,
  ].join("\n");

  let content = "{}";
  try {
    content = await aiChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      responseFormat: "json_object",
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/Limite de requisi/i.test(msg)) throw new Error("rate_limit");
    if (/Cr[eé]ditos/i.test(msg)) throw new Error("no_credits");
    return null;
  }
  let parsed: { query?: string; confianca?: string } = {};
  try { parsed = JSON.parse(content); } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  const query = (parsed.query ?? "").trim();
  if (!query) return null;
  return { query, confianca: parsed.confianca ?? "media" };
}

const Input = z.object({
  limit: z.number().int().min(1).max(30).optional().default(15),
});

export const geocodarProtocolosPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabase } = context;

    const { data: pendentes, error } = await supabase
      .from("protocolos")
      .select("id, assunto, descricao, endereco, solicitante, categoria, locais(nome), secretarias(nome)")
      .is("latitude", null)
      .order("data_abertura", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    let processados = 0;
    let geocodificados = 0;
    let semDados = 0;
    const erros: string[] = [];

    for (const p of pendentes ?? []) {
      processados++;
      try {
        const sug = await sugerirQuery({
          assunto: p.assunto,
          descricao: (p as any).descricao,
          endereco: p.endereco,
          solicitante: (p as any).solicitante,
          secretaria: (p as any).secretarias?.nome,
          local: (p as any).locais?.nome,
          categoria: p.categoria,
        });
        if (!sug) { semDados++; continue; }

        // Nominatim rate limit: 1 req/sec
        await new Promise((r) => setTimeout(r, 1100));
        const hit = await geocodeQuery(sug.query);
        if (!hit) { semDados++; continue; }

        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        // Sanity check: Brusque region (~lat -27.0 to -27.2, lng -48.8 to -49.0)
        if (lat < -27.3 || lat > -26.9 || lng < -49.1 || lng > -48.7) {
          semDados++;
          continue;
        }

        const upd = await supabase
          .from("protocolos")
          .update({ latitude: lat, longitude: lng })
          .eq("id", p.id);
        if (upd.error) {
          erros.push(`${p.id}: ${upd.error.message}`);
        } else {
          geocodificados++;
        }
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (msg === "rate_limit" || msg === "no_credits") {
          erros.push(msg);
          break;
        }
        erros.push(`${p.id}: ${msg}`);
      }
    }

    const { count: restantes } = await supabase
      .from("protocolos")
      .select("id", { count: "exact", head: true })
      .is("latitude", null);

    return { processados, geocodificados, semDados, erros, restantes: restantes ?? 0 };
  });