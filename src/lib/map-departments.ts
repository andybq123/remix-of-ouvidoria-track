export type MapDepartmentScope = "saude" | "obras" | "todos";
export type MapDepartment = Exclude<MapDepartmentScope, "todos">;

export type MapDepartmentRecord = {
  nome?: string | null;
  sigla?: string | null;
};

function normalize(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function mapDepartmentOf(secretaria: MapDepartmentRecord): MapDepartment | null {
  const nome = normalize(secretaria.nome);
  const sigla = normalize(secretaria.sigla);
  const texto = `${nome} ${sigla}`;

  if (
    sigla === "sosu" ||
    /\bsosu\b/.test(nome) ||
    /\bobras?\b/.test(nome) ||
    /servicos urbanos/.test(nome)
  ) {
    return "obras";
  }
  if (/\bsaude\b/.test(nome) || /\bsaude\b/.test(sigla)) {
    return "saude";
  }
  return null;
}

export function matchesMapDepartment(
  secretaria: MapDepartmentRecord,
  scope: MapDepartmentScope,
): boolean {
  return scope === "todos" || mapDepartmentOf(secretaria) === scope;
}

/**
 * Áreas do mapa que o usuário pode ver, dada sua lista de secretarias
 * vinculadas (user_secretarias). Lista vazia = sem restrição = ambas as áreas.
 * Lista com áreas, mas nenhuma de Saúde/Obras = nenhum mapa disponível.
 */
export function escoposMapaPermitidos(areas: MapDepartmentRecord[]): MapDepartment[] {
  if (areas.length === 0) return ["saude", "obras"];
  const escopos = new Set<MapDepartment>();
  for (const area of areas) {
    const dep = mapDepartmentOf(area);
    if (dep) escopos.add(dep);
  }
  return [...escopos];
}

/** Usuário restrito apenas à Saúde não precisa da página Protocolos (tudo dele fica na aba Saúde). */
export function somenteSaude(areas: MapDepartmentRecord[]): boolean {
  return areas.length > 0 && areas.every((a) => mapDepartmentOf(a) === "saude");
}
