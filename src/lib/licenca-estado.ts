// Regra pura: resposta do heartbeat -> novo estado da licença.
// Espelhada em local-docker/deploy/heartbeat-licenca.sh.
export const MENSAGEM_BLOQUEIO = "Sistema bloqueado pela licença: somente consulta";
export const CODIGOS_BLOQUEIO = ["instance_blocked", "revoked", "suspended", "expired"] as const;

export type EstadoLicenca = { bloqueado: boolean; motivo: string | null; codigo: string | null };
export type RespostaHeartbeat = { valida?: boolean; mensagem?: string; codigo?: string } | null;

/** null = servidor fora do ar/resposta inválida: mantém o estado anterior. */
export function decidirEstado(resp: RespostaHeartbeat, anterior: EstadoLicenca): EstadoLicenca {
  if (!resp || typeof resp !== "object") return anterior;
  const codigo = resp.codigo ?? null;
  if (codigo && (CODIGOS_BLOQUEIO as readonly string[]).includes(codigo)) {
    return { bloqueado: true, motivo: resp.mensagem || codigo, codigo };
  }
  if (resp.valida === true) return { bloqueado: false, motivo: null, codigo };
  return anterior;
}
