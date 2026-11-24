/**
 * Animação do Ouvidorizinho — máquina de estados pura (testável sem DOM).
 *
 * Estados:
 * - "idle": loop parado, digitando no notebook.
 * - "telefone": atende um telefone uma vez, volta ao idle.
 * - "pensando": bola de cristal em loop enquanto o chat busca a resposta.
 * - "desconfiado": olha desconfiado para quem passou o mouse, uma vez.
 *
 * Prioridade: pensando > desconfiado > telefone > idle. O vídeo de
 * telefone só dispara com o chat fechado e a aba visível, em intervalo
 * aleatório de 45 a 90 segundos.
 */

export type EstadoAnimacao = "idle" | "telefone" | "pensando" | "desconfiado";

export const VIDEO_POR_ESTADO: Record<EstadoAnimacao, string> = {
  idle: "/ouvidorizinho-idle.mp4",
  telefone: "/ouvidorizinho-telefone.mp4",
  pensando: "/ouvidorizinho-pensando.mp4",
  desconfiado: "/ouvidorizinho-desconfiado.mp4",
};

export const POSTER_OUVIDORIZINHO = "/ouvidorizinho.png";

export const INTERVALO_TELEFONE_MIN_MS = 45_000;
export const INTERVALO_TELEFONE_MAX_MS = 90_000;

/** Intervalo aleatório entre dois telefonemas, em milissegundos. */
export function proximoIntervaloTelefone(): number {
  return (
    INTERVALO_TELEFONE_MIN_MS +
    Math.random() * (INTERVALO_TELEFONE_MAX_MS - INTERVALO_TELEFONE_MIN_MS)
  );
}

export type EntradasEstado = {
  pensando: boolean;
  desconfiadoAtivo: boolean;
  telefoneAtivo: boolean;
};

/** Resolve o estado visível a partir das entradas, pela prioridade. */
export function resolverEstadoAnimacao(e: EntradasEstado): EstadoAnimacao {
  if (e.pensando) return "pensando";
  if (e.desconfiadoAtivo) return "desconfiado";
  if (e.telefoneAtivo) return "telefone";
  return "idle";
}

/** Estados que tocam uma vez e voltam ao idle; os demais são loops. */
export function estadoTocaUmaVez(estado: EstadoAnimacao): boolean {
  return estado === "telefone" || estado === "desconfiado";
}

/**
 * Inclinação do mascote em direção ao cursor, em graus, limitada para
 * não virar demais. dx/dy são o deslocamento do cursor em relação ao
 * centro do botão, em pixels.
 */
export function inclinacaoParaCursor(
  dx: number,
  dy: number,
): { rotacao: number; deslocamentoX: number } {
  const rotacao = Math.max(-8, Math.min(8, dx / 12));
  const deslocamentoX = Math.max(-6, Math.min(6, dx / 16));
  void dy;
  return { rotacao, deslocamentoX };
}
