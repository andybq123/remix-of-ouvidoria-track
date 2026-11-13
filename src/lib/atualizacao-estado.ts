export type AtualizacaoEstado = { status: string; created_at: string; updated_at: string };
export function estadoAtualizacao(job: AtualizacaoEstado, now = Date.now()) {
  const pendente = job.status === "pendente";
  const rodando = job.status === "rodando";
  return {
    ativo: pendente || rodando,
    podeCancelar: pendente && now - Date.parse(job.created_at) > 60_000,
    semResposta: rodando && now - Date.parse(job.updated_at) > 180_000,
  };
}