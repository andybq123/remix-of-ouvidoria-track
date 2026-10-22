// Regra: ouvidorias cujo número traz um ano de outro sistema (ex.: /2025)
// não existem no 1Doc atual, por isso não devem aparecer na tela "Sem link 1Doc".
export const ANOS_DE_OUTRO_SISTEMA = ["2025"] as const;

// Regra: no ano do 1Doc atual, as ouvidorias com número até o limite (inclusive)
// também pertencem a outro sistema — não têm link do 1Doc, então não entram na lista.
export const MAX_DE_OUTRO_SISTEMA_POR_ANO: Record<string, number> = { "2026": 570 };

// Número antes da barra: "3.565" vale 3565, "12" vale 12. Sem dígitos, retorna null.
export function valorDoNumero(numero: string): number | null {
  const digits = numero.slice(0, numero.lastIndexOf("/")).replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export function deveConstarSemLink1doc(numero: string | null | undefined): boolean {
  if (!numero) return true;
  const corte = numero.lastIndexOf("/");
  if (corte < 0) return true;
  const ano = numero.slice(corte + 1).trim();
  if ((ANOS_DE_OUTRO_SISTEMA as readonly string[]).includes(ano)) return false;
  const maximo = MAX_DE_OUTRO_SISTEMA_POR_ANO[ano];
  if (maximo === undefined) return true;
  const valor = valorDoNumero(numero);
  return valor === null || valor > maximo;
}

// Aplica a regra dos anos de outro sistema direto na consulta ao banco, para que a
// contagem da tela também ignore as ouvidorias de outro sistema.
export function semLinkDeOutroSistema<
  T extends { not: (column: string, operator: string, value: string) => T },
>(query: T): T {
  let q = query;
  for (const ano of ANOS_DE_OUTRO_SISTEMA) q = q.not("numero", "like", `%/${ano}%`);
  return q;
}
