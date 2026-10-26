import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NOMINATIM_HEADERS = {
  "User-Agent": "OuviDesk/1.0 (Ouvidoria Brusque)",
  "Accept-Language": "pt-BR",
};

const Input = z.object({
  assunto: z.string().max(300).optional().default(""),
  descricao: z.string().max(4000).optional().default(""),
  endereco: z.string().max(300).optional().default(""),
  solicitante: z.string().max(300).optional().default(""),
  secretaria: z.string().max(300).optional().default(""),
  local: z.string().max(300).optional().default(""),
  categoria: z.string().max(300).optional().default(""),
});

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
};

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

export const sugerirLocalizacaoIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const system = `Você é um assistente que extrai a localização mais provável de uma manifestação de ouvidoria municipal no município de Brusque, Santa Catarina, Brasil.

Analise as informações fornecidas (assunto, descrição, endereço informado, secretaria, local/UBS) e retorne em JSON o melhor palpite de endereço para localizar o ponto no mapa.

Regras:
- Retorne APENAS JSON válido, sem markdown, sem comentários.
- Formato: {"query":"<endereço/local em Brusque-SC>","confianca":"alta"|"media"|"baixa","justificativa":"<curta>"}
- Prefira ruas e números explícitos quando existirem. Caso contrário, use bairro, ponto de referência (escola, UBS, praça, igreja) ou local citado.
- Se nada permitir localizar (sem rua, sem bairro, sem ponto de referência), retorne {"query":"","confianca":"baixa","justificativa":"sem dados suficientes"}.
- Nunca invente endereços fora de Brusque-SC.`;

    const userMsg = [
      `Assunto: ${data.assunto || "—"}`,
      `Descrição: ${data.descricao || "—"}`,
      `Endereço informado: ${data.endereco || "—"}`,
      `Solicitante: ${data.solicitante || "—"}`,
      `Secretaria responsável: ${data.secretaria || "—"}`,
      `Local/UBS: ${data.local || "—"}`,
      `Categoria: ${data.categoria || "—"}`,
    ].join("\n");

    const { aiChat } = await import("./ai-chat.server");
    const content = await aiChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      responseFormat: "json_object",
    });

    let parsed: { query?: string; confianca?: string; justificativa?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    const query = (parsed.query ?? "").trim();
    if (!query) {
      return {
        lat: null as number | null,
        lng: null as number | null,
        label: null as string | null,
        query: "",
        confianca: (parsed.confianca ?? "baixa") as string,
        justificativa: parsed.justificativa ?? "Sem informações suficientes para sugerir uma localização.",
      };
    }

    const hit = await geocodeQuery(query);
    if (!hit) {
      return {
        lat: null,
        lng: null,
        label: null,
        query,
        confianca: (parsed.confianca ?? "baixa") as string,
        justificativa: parsed.justificativa ?? "",
      };
    }

    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      label: hit.display_name,
      query,
      confianca: (parsed.confianca ?? "media") as string,
      justificativa: parsed.justificativa ?? "",
    };
  });