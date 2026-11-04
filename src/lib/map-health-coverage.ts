type HealthPoint = {
  id: string;
  lat: number;
  lng: number;
  local_id?: string | null;
  mapDepartment?: string | null;
};

/** Health protocols are represented by a visible unit or, failing that, their own coordinates. */
export function coberturaSaudeMapa<T extends HealthPoint>(points: T[], locais: { id: string }[]) {
  const ids = new Set(locais.map(l => l.id));
  const individuais: T[] = [];
  const semLocalizacao: T[] = [];
  let porUnidade = 0;
  for (const p of points) {
    if (p.mapDepartment !== "saude") continue;
    if (p.local_id && ids.has(p.local_id)) {
      porUnidade++;
    } else if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      individuais.push(p);
    } else {
      semLocalizacao.push(p);
    }
  }
  return { individuais, semLocalizacao, porUnidade };
}