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
