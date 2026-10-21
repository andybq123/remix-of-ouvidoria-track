/** O BI apresenta somente secretarias com manifestações no período consultado. */
export function secretariasComManifestacoes<T extends { total: number }>(secretarias: T[]): T[] {
  return secretarias.filter((secretaria) => secretaria.total > 0);
}