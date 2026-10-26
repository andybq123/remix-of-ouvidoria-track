import { createServerFn } from "@tanstack/react-start";
import { parseSuggestion, extractQueryNumber, type NominatimResult } from "./address-parse";

const NOMINATIM_HEADERS = {
  "User-Agent": "OuviDesk/1.0 (Ouvidoria Brusque)",
  "Accept-Language": "pt-BR",
};

async function nominatim(params: URLSearchParams): Promise<NominatimResult[]> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: NOMINATIM_HEADERS,
  });
  if (!res.ok) return [];
  return (await res.json()) as NominatimResult[];
}

function stripNumber(q: string, numero: string) {
  const idx = q.lastIndexOf(numero);
  return (q.slice(0, idx) + q.slice(idx + numero.length))
    .replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim().replace(/^,|,$/g, "");
}

/**
 * Returns the most precise match for a number+street query.
 * Nominatim falls back to the street centroid when the house number is not in OSM,
 * so we explicitly prefer results whose address.house_number === requested number.
 */
async function findBestMatch(q: string): Promise<{ result: NominatimResult; exact: boolean } | null> {
  const numero = extractQueryNumber(q);

  // 1) Structured search (highest accuracy when OSM has the house number)
  if (numero) {
    const street = stripNumber(q, numero);
    const structured = new URLSearchParams({
      street: `${numero} ${street}`.trim(),
      city: "Brusque",
      state: "Santa Catarina",
      country: "Brasil",
      format: "json",
      limit: "10",
      countrycodes: "br",
      addressdetails: "1",
      dedupe: "0",
    });
    const sArr = await nominatim(structured);
    const exact = sArr.find(r => r.address?.house_number === numero);
    if (exact) return { result: exact, exact: true };

    // 2) Free-text search including the number — sometimes finds addr:interpolation
    //    or building-tagged points that the structured search misses.
    const freeText = new URLSearchParams({
      q: `${q}, Brusque, Santa Catarina, Brasil`,
      format: "json",
      limit: "10",
      countrycodes: "br",
      addressdetails: "1",
      dedupe: "0",
    });
    const fArr = await nominatim(freeText);
    const exact2 = fArr.find(r => r.address?.house_number === numero);
    if (exact2) return { result: exact2, exact: true };

    // 3) Fallback: return whatever the structured search gave (street centroid),
    //    flagged as non-exact so caller / UI can warn the user.
    if (sArr.length) return { result: sArr[0], exact: false };
    if (fArr.length) return { result: fArr[0], exact: false };
    return null;
  }

  // No number in the query — plain free-text search.
  const params = new URLSearchParams({
    q: `${q}, Brusque, Santa Catarina, Brasil`,
    format: "json",
    limit: "1",
    countrycodes: "br",
    addressdetails: "1",
  });
  const arr = await nominatim(params);
  return arr.length ? { result: arr[0], exact: false } : null;
}

export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator((d: { endereco: string }) => ({ endereco: String(d?.endereco ?? "").slice(0, 300) }))
  .handler(async ({ data }) => {
    const q = data.endereco?.trim();
    if (!q) {
      return { lat: null as number | null, lng: null as number | null, exact: false, refused: false };
    }
    const best = await findBestMatch(q);
    if (!best) return { lat: null, lng: null, exact: false, refused: false };
    // Refuse street-centroid results: when the user supplied a house number but
    // Nominatim could not match it exactly, returning the street midpoint would
    // place a misleading pin on the map. Drop the coords and signal `refused`.
    if (extractQueryNumber(q) && !best.exact) {
      return { lat: null, lng: null, exact: false, refused: true };
    }
    return {
      lat: parseFloat(best.result.lat),
      lng: parseFloat(best.result.lon),
      exact: best.exact,
      refused: false,
    };
  });

export type AddressSuggestion = {
  label: string;
  lat: number;
  lng: number;
  houseNumber?: string;
  /** true when the result actually matches the requested house number (not a street fallback). */
  exact?: boolean;
};

export const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string }) => ({ q: String(d?.q ?? "").slice(0, 200) }))
  .handler(async ({ data }): Promise<AddressSuggestion[]> => {
    const q = data.q?.trim();
    if (!q || q.length < 3) return [];

    const numero = extractQueryNumber(q);

    // With a number: prefer EXACT matches (address.house_number === numero) over
    // street-centroid fallbacks. We tag suggestions with `exact` so the UI can warn.
    if (numero) {
      const street = stripNumber(q, numero);
      const structured = new URLSearchParams({
        street: `${numero} ${street}`.trim(),
        city: "Brusque",
        state: "Santa Catarina",
        country: "Brasil",
        format: "json",
        limit: "10",
        countrycodes: "br",
        addressdetails: "1",
        dedupe: "0",
      });
      const sArr = await nominatim(structured);
      const exactMatches = sArr.filter(r => r.address?.house_number === numero);
      if (exactMatches.length) {
        return exactMatches.slice(0, 6).map(r => ({
          ...parseSuggestion(r, numero),
          exact: true,
        }));
      }

      // Try free-text — it can return addr:interpolation hits the structured search misses.
      const freeText = new URLSearchParams({
        q: `${q}, Brusque, Santa Catarina, Brasil`,
        format: "json",
        limit: "10",
        countrycodes: "br",
        addressdetails: "1",
        dedupe: "0",
      });
      const fArr = await nominatim(freeText);
      const exactFree = fArr.filter(r => r.address?.house_number === numero);
      if (exactFree.length) {
        return exactFree.slice(0, 6).map(r => ({
          ...parseSuggestion(r, numero),
          exact: true,
        }));
      }

      // No exact match anywhere — refuse street-centroid fallbacks entirely so
      // the user does not pick a pin in the middle of the road by mistake.
      return [];
    }

    const params = new URLSearchParams({
      q: `${q}, Brusque, Santa Catarina, Brasil`,
      format: "json",
      limit: "6",
      countrycodes: "br",
      addressdetails: "1",
    });
    const arr = await nominatim(params);
    return arr.map(r => ({ ...parseSuggestion(r), exact: false }));
  });