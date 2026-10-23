// Regras de restrição de áreas (secretarias) para usuários de leitura.
// O vínculo é por e-mail (minúsculas), pois o usuário pode ainda não ter
// se registrado quando o admin define as áreas.

export function normalizarEmailAreas(email: string): string {
  return email.trim().toLowerCase();
}

/** Agrupa vínculos vindos do banco em e-mail -> lista de secretaria_ids (sem duplicatas). */
export function agruparAreasPorEmail(
  rows: { email: string; secretaria_id: string }[],
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const r of rows) {
    const email = normalizarEmailAreas(r.email);
    const lista = mapa.get(email) ?? [];
    if (!lista.includes(r.secretaria_id)) lista.push(r.secretaria_id);
    mapa.set(email, lista);
  }
  return mapa;
}

/** Monta as linhas de vínculo a gravar: e-mail normalizado e áreas sem duplicatas. Lista vazia = sem restrição. */
export function prepararVinculosAreas(
  email: string,
  secretariaIds?: string[],
): { email: string; secretaria_id: string }[] {
  const unicos = [...new Set((secretariaIds ?? []).filter(Boolean))];
  return unicos.map((secretaria_id) => ({
    email: normalizarEmailAreas(email),
    secretaria_id,
  }));
}

/** Áreas formadas por um local (ex.: Vigilância Sanitária) usam o id "local:<uuid>" na lista de áreas. */
export const PREFIXO_AREA_LOCAL = "local:";

export function separarAreas(ids?: string[]): { secretarias: string[]; locais: string[] } {
  const secretarias: string[] = [];
  const locais: string[] = [];
  for (const id of [...new Set((ids ?? []).filter(Boolean))]) {
    if (id.startsWith(PREFIXO_AREA_LOCAL)) locais.push(id.slice(PREFIXO_AREA_LOCAL.length));
    else secretarias.push(id);
  }
  return { secretarias, locais };
}
