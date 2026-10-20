// Snapshot de alterações efetivamente salvas, independente do estado futuro do protocolo.
export function resultadoConferencia(protocolo, atualizacao, analise, fonte, agora = new Date()) {
  return {
    id: protocolo.id, numero: protocolo.numero,
    secretaria_id: protocolo.secretaria_id ?? null,
    secretaria_nome: protocolo.secretarias?.nome ?? "Sem secretaria",
    verificado_em: agora.toISOString(), fonte,
    situacao: analise.situacao, baixado_em: analise.baixado_em,
    arquivado_em: analise.arquivado_em,
    endereco_atualizado: typeof atualizacao.endereco === "string" && atualizacao.endereco !== (protocolo.endereco ?? ""),
    endereco_anterior: protocolo.endereco ?? null,
    endereco_novo: atualizacao.endereco ?? protocolo.endereco ?? null,
    concluido: atualizacao.status === "concluido" && protocolo.status !== "concluido",
    data_conclusao: atualizacao.data_conclusao ?? null,
    localizacao_atualizada: atualizacao.latitude != null && atualizacao.longitude != null,
  };
}