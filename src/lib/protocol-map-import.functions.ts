import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "@/lib/admin-guard.server";
import ouvidoriasData from "@/data/ouvidorias.json";
import {
  buildProtocolNumberOrFilter,
  MAX_PROTOCOL_MAP_IMPORT_LINES,
  parseProtocolNumber,
  parseProtocolAddressLines,
  protocolNumberMatches,
} from "@/lib/protocol-map-import.shared";

const INPUT = z.object({ text: z.string().trim().min(1).max(30_000) });
const NOMINATIM_HEADERS = {
  "User-Agent": "OuviDesk/1.0 (Ouvidoria Brusque)",
  "Accept-Language": "pt-BR",
};

export type ProtocolMapCandidate = {
  placeId: string;
  latitude: number;
  longitude: number;
  displayName: string;
};

export type ProtocolMapProtocolMatch = {
  id: string;
  numero: string;
  assunto: string | null;
  secretaria: string | null;
  currentEndereco: string | null;
  hasCoordinates: boolean;
  isAntigo: boolean;
};

export type ProtocolMapLegacyMatch = {
  numero: string;
  ano: number;
  origem: string;
};

export type ProtocolMapPreviewRow = {
  line: number;
  numero: string;
  endereco: string;
  protocolId: string | null;
  assunto: string | null;
  secretaria: string | null;
  currentEndereco: string | null;
  hasCoordinates: boolean;
  status: "pronto" | "nao_encontrado" | "duplicado" | "sem_resultado" | "fora_area" | "erro";
  message: string;
  candidates: ProtocolMapCandidate[];
  numeroPersistido?: string | null;
  protocolMatches?: ProtocolMapProtocolMatch[];
  legacyMatches?: ProtocolMapLegacyMatch[];
  geocodeStatus?: "pronto" | "sem_resultado" | "fora_area" | "erro";
  geocodeMessage?: string;
};

function inBrusqueBounds(latitude: number, longitude: number): boolean {
  return latitude >= -27.3 && latitude <= -26.9 && longitude >= -49.1 && longitude <= -48.7;
}

function expandAddressAbbreviations(address: string): string {
  return address
    .replace(/\bR\.(?=\s|$)/gi, "Rua")
    .replace(/\bAv\.(?=\s|$)/gi, "Avenida")
    .replace(/\bRod\.(?=\s|$)/gi, "Rodovia")
    .replace(/\bEstr\.(?=\s|$)/gi, "Estrada")
    .replace(/\bTv\.(?=\s|$)/gi, "Travessa");
}

async function geocodeAddress(address: string): Promise<{
  candidates: ProtocolMapCandidate[];
  hadResults: boolean;
}> {
  const params = new URLSearchParams({
    q: `${expandAddressAbbreviations(address)}, Brusque, Santa Catarina, Brasil`,
    format: "jsonv2",
    limit: "5",
    countrycodes: "br",
    addressdetails: "1",
    viewbox: "-49.1,-26.9,-48.7,-27.3",
    bounded: "1",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: NOMINATIM_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 429)
      throw new Error("O geocodificador limitou as consultas; aguarde e tente novamente.");
    throw new Error(`Falha no geocodificador (HTTP ${response.status}).`);
  }

  const hits = (await response.json()) as Array<{
    place_id: number | string;
    lat: string;
    lon: string;
    display_name: string;
  }>;
  const candidates = hits.flatMap((hit) => {
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !inBrusqueBounds(latitude, longitude)
    )
      return [];
    return [
      {
        placeId: String(hit.place_id),
        latitude,
        longitude,
        displayName: hit.display_name,
      },
    ];
  });
  return { candidates, hadResults: hits.length > 0 };
}

export const previsualizarImportacaoProtocolosMapa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => INPUT.parse(data))
  .handler(async ({ context, data }) => {
    await exigirAdmin(context);
    const parsed = parseProtocolAddressLines(data.text);
    if (!parsed.entries.length && !parsed.issues.length)
      throw new Error("Cole ao menos uma linha no formato número — endereço.");
    if (parsed.entries.length + parsed.issues.length > MAX_PROTOCOL_MAP_IMPORT_LINES) {
      throw new Error(
        `Limite de ${MAX_PROTOCOL_MAP_IMPORT_LINES} linhas por lote. Divida o texto em lotes menores.`,
      );
    }

    const { adminComAutor } = await import("@/lib/audit-admin.server");
    const supabaseAdmin = adminComAutor(context.userId);
    const sb = supabaseAdmin;
    const rows: ProtocolMapPreviewRow[] = [];

    for (const issue of parsed.issues) {
      rows.push({
        line: issue.line,
        numero: "",
        endereco: issue.text,
        protocolId: null,
        assunto: null,
        secretaria: null,
        currentEndereco: null,
        hasCoordinates: false,
        status: "erro",
        message: issue.message,
        candidates: [],
      });
    }

    for (let index = 0; index < parsed.entries.length; index++) {
      const entry = parsed.entries[index];
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
      const { data: possibleMatches, error } = await sb
        .from("protocolos")
        .select("id, numero, assunto, endereco, latitude, longitude, origem, secretarias(nome, sigla)")
        .or(buildProtocolNumberOrFilter(entry.numero))
        .limit(100);
      if (error) {
        rows.push({
          line: entry.line,
          numero: entry.numero,
          endereco: entry.endereco,
          protocolId: null,
          assunto: null,
          secretaria: null,
          currentEndereco: null,
          hasCoordinates: false,
          status: "erro",
          message: `Falha ao consultar o protocolo: ${error.message}`,
          candidates: [],
        });
        continue;
      }

      const matches = (possibleMatches ?? []).filter((protocol) =>
        protocolNumberMatches(entry.numero, protocol.numero),
      );
      const { baseDigits, yearDigits } = parseProtocolNumber(entry.numero);
      const archivedByKey = new Map<string, ProtocolMapLegacyMatch>();
      const baseNumber = Number(baseDigits);
      if (Number.isSafeInteger(baseNumber) && baseNumber > 0) {
        let archiveQuery = sb
          .from("protocolos_antigos_conclusoes")
          .select("numero, ano, source")
          .eq("numero", baseNumber);
        if (yearDigits) archiveQuery = archiveQuery.eq("ano", Number(yearDigits));
        const { data: archiveRows } = await archiveQuery.limit(30);
        for (const archived of archiveRows ?? []) {
          const displayNumber = `${Number(archived.numero).toLocaleString("pt-BR")}/${archived.ano}`;
          archivedByKey.set(`${archived.source}|${archived.ano}|${archived.numero}`, {
            numero: displayNumber,
            ano: archived.ano,
            origem: `${archived.source} · conclusões antigas`,
          });
        }
        const staticOld = (ouvidoriasData as Array<{ source: string; data: string; numero: number }>)
          .filter((old) => Number(old.numero) === baseNumber)
          .filter((old) => !yearDigits || old.data?.slice(0, 4) === yearDigits);
        for (const archived of staticOld) {
          const year = Number(archived.data?.slice(0, 4));
          if (!year) continue;
          const displayNumber = `${Number(archived.numero).toLocaleString("pt-BR")}/${year}`;
          archivedByKey.set(`${archived.source}|${year}|${archived.numero}`, {
            numero: displayNumber,
            ano: year,
            origem: `${archived.source} · arquivo histórico`,
          });
        }
      }
      const legacyMatches = [...archivedByKey.values()].slice(0, 10);
      if (!matches.length) {
        rows.push({
          line: entry.line,
          numero: entry.numero,
          endereco: entry.endereco,
          protocolId: null,
          assunto: null,
          secretaria: null,
          currentEndereco: null,
          hasCoordinates: false,
          status: "nao_encontrado",
          message: legacyMatches.length
            ? "Encontrado apenas no histórico. Importe esse protocolo antigo para a tabela principal antes de registrar um ponto no mapa."
            : "Nenhum protocolo com esse número foi encontrado.",
          candidates: [],
          legacyMatches,
        });
        continue;
      }

      const protocolMatches: ProtocolMapProtocolMatch[] = matches.map((protocol) => ({
        id: protocol.id,
        numero: protocol.numero,
        assunto: protocol.assunto,
        secretaria: protocol.secretarias?.nome ?? null,
        currentEndereco: protocol.endereco,
        hasCoordinates: protocol.latitude != null && protocol.longitude != null,
        isAntigo: typeof protocol.origem === "string" && protocol.origem.startsWith("antigo:"),
      }));
      let candidates: ProtocolMapCandidate[] = [];
      let geocodeStatus: ProtocolMapPreviewRow["geocodeStatus"] = "erro";
      let geocodeMessage = "Falha ao geocodificar o endereço.";
      let geocodeRateLimited = false;
      try {
        const result = await geocodeAddress(entry.endereco);
        candidates = result.candidates;
        geocodeStatus = candidates.length ? "pronto" : result.hadResults ? "fora_area" : "sem_resultado";
        geocodeMessage = candidates.length
          ? `${candidates.length} resultado(s) dentro da área de Brusque.`
          : result.hadResults
            ? "O resultado encontrado ficou fora da área aproximada de Brusque."
            : "Endereço não localizado; tente escolher o ponto manualmente no mapa.";
      } catch (geocodeError) {
        geocodeMessage = geocodeError instanceof Error
          ? geocodeError.message
          : "Falha ao geocodificar o endereço.";
        geocodeRateLimited = geocodeError instanceof Error && /limitou as consultas/.test(geocodeError.message);
      }
      const uniqueProtocol = matches.length === 1 ? protocolMatches[0] : null;
      const status = matches.length > 1 ? "duplicado" : geocodeStatus;
      rows.push({
        line: entry.line,
        numero: entry.numero,
        endereco: entry.endereco,
        protocolId: uniqueProtocol?.id ?? null,
        numeroPersistido: uniqueProtocol?.numero ?? null,
        protocolMatches,
        assunto: uniqueProtocol?.assunto ?? null,
        secretaria: uniqueProtocol?.secretaria ?? null,
        currentEndereco: uniqueProtocol?.currentEndereco ?? null,
        hasCoordinates: uniqueProtocol?.hasCoordinates ?? false,
        status,
        message: matches.length > 1
          ? `${matches.length} protocolos correspondem a ${entry.numero}; escolha o ano/registro antes de continuar. Endereço: ${geocodeMessage}`
          : geocodeMessage,
        candidates,
        geocodeStatus,
        geocodeMessage,
        legacyMatches,
      });
      if (geocodeRateLimited) break;
    }

    rows.sort((a, b) => a.line - b.line);
    return { rows, maxRows: MAX_PROTOCOL_MAP_IMPORT_LINES };
  });

const APPLY_INPUT = z.object({
  rows: z
    .array(
      z.object({
        protocolId: z.string().uuid(),
        numero: z.string().trim().min(1).max(100),
        endereco: z.string().trim().min(1).max(500),
        latitude: z.number().min(-27.3).max(-26.9),
        longitude: z.number().min(-49.1).max(-48.7),
      }),
    )
    .min(1)
    .max(MAX_PROTOCOL_MAP_IMPORT_LINES),
  sobrescrever: z.boolean().default(false),
});

export const aplicarImportacaoProtocolosMapa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => APPLY_INPUT.parse(data))
  .handler(async ({ context, data }) => {
    await exigirAdmin(context);
    if (new Set(data.rows.map((row) => row.protocolId)).size !== data.rows.length) {
      throw new Error("O lote contém protocolos repetidos.");
    }

    const { adminComAutor } = await import("@/lib/audit-admin.server");
    const supabaseAdmin = adminComAutor(context.userId);
    const sb = supabaseAdmin;
    const atualizados: string[] = [];
    const ignorados: string[] = [];
    const erros: string[] = [];

    for (const row of data.rows) {
      const { data: protocol, error: findError } = await sb
        .from("protocolos")
        .select("id, numero, latitude, longitude")
        .eq("id", row.protocolId)
        .maybeSingle();
      if (findError || !protocol) {
        erros.push(`${row.numero}: protocolo não encontrado no momento da gravação.`);
        continue;
      }
      if (protocol.numero !== row.numero) {
        erros.push(`${row.numero}: o número do protocolo mudou desde a prévia.`);
        continue;
      }
      const hasCoordinates = protocol.latitude != null && protocol.longitude != null;
      if (hasCoordinates && !data.sobrescrever) {
        ignorados.push(row.numero);
        continue;
      }

      const { error: updateError } = await sb
        .from("protocolos")
        .update({ endereco: row.endereco, latitude: row.latitude, longitude: row.longitude })
        .eq("id", row.protocolId)
        .eq("numero", row.numero);
      if (updateError) erros.push(`${row.numero}: ${updateError.message}`);
      else atualizados.push(row.numero);
    }

    return { atualizados, ignorados, erros };
  });
