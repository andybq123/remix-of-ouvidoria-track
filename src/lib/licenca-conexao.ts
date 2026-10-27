// O heartbeat ocorre a cada cinco minutos. Duas janelas sem confirmação
// indicam indisponibilidade, sem alterar o bloqueio da licença.
export const LIMITE_HEARTBEAT_MS = 10 * 60 * 1000;

export function conexaoLicenca(verificadoEm: string | null | undefined, agora = Date.now()): "online" | "offline" {
  if (!verificadoEm) return "offline";
  const confirmado = Date.parse(verificadoEm);
  return Number.isFinite(confirmado) && confirmado <= agora && agora - confirmado <= LIMITE_HEARTBEAT_MS
    ? "online"
    : "offline";
}