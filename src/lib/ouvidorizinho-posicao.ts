/**
 * Posição do widget flutuante do Ouvidorzinho — funções puras.
 *
 * A posição é o canto superior-esquerdo do botão do mascote, em pixels
 * da viewport, e fica guardada em localStorage. Tudo aqui é testável
 * sem DOM: o componente só lê/escreve o storage e o tamanho da janela.
 */

export type PosicaoWidget = { x: number; y: number };

export const CHAVE_POSICAO_OUVIDORZINHO = "ouvidorizinho-posicao-v1";
export const TAMANHO_MASCOTE = 48;
export const MARGEM_WIDGET = 12;

/** Posição padrão: canto inferior direito, com margem. */
export function posicaoPadrao(larguraJanela: number, alturaJanela: number): PosicaoWidget {
  return {
    x: Math.max(MARGEM_WIDGET, larguraJanela - TAMANHO_MASCOTE - 24),
    y: Math.max(MARGEM_WIDGET, alturaJanela - TAMANHO_MASCOTE - 24),
  };
}

/** Mantém a posição dentro da viewport (o botão nunca some da tela). */
export function clampPosicao(
  pos: PosicaoWidget,
  larguraJanela: number,
  alturaJanela: number,
  tamanho: number = TAMANHO_MASCOTE,
  margem: number = MARGEM_WIDGET,
): PosicaoWidget {
  return {
    x: Math.min(Math.max(pos.x, margem), Math.max(margem, larguraJanela - tamanho - margem)),
    y: Math.min(Math.max(pos.y, margem), Math.max(margem, alturaJanela - tamanho - margem)),
  };
}

/** Serializa a posição para guardar em localStorage. */
export function serializarPosicao(pos: PosicaoWidget): string {
  return JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) });
}

/**
 * Lê uma posição guardada. Devolve null quando o valor é inválido
 * (texto quebrado, campos ausentes, não-numérico) — o componente cai
 * então para a posição padrão.
 */
export function deserializarPosicao(valor: string | null): PosicaoWidget | null {
  if (!valor) return null;
  try {
    const parsed: unknown = JSON.parse(valor);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { x, y } = parsed as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}
