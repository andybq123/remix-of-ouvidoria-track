// Regra: ouvidorias cujo número traz um ano de outro sistema (ex.: /2025)
// não existem no 1Doc atual, por isso não devem aparecer na tela "Sem link 1Doc".
export const ANOS_DE_OUTRO_SISTEMA = ["2025"] as const;

export function deveConstarSemLink1doc(numero: string | null | undefined): boolean {
  if (!numero) return true;
  return !ANOS_DE_OUTRO_SISTEMA.some((ano) => numero.includes(`/${ano}`));
}

// Aplica a mesma regra direto na consulta ao banco, para que a contagem da tela
// também ignore as ouvidorias de outro sistema.
export function semLinkDeOutroSistema<
  T extends { not: (column: string, operator: string, value: string) => T },
>(query: T): T {
  let q = query;
  for (const ano of ANOS_DE_OUTRO_SISTEMA) q = q.not("numero", "like", `%/${ano}%`);
  return q;
}
