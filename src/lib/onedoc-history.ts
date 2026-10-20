export type OnedocResultado = {
  id: string; numero?: string; secretaria_id?: string | null; secretaria_nome?: string;
  verificado_em?: string; erro?: string; concluido?: boolean; data_conclusao?: string | null;
  endereco_atualizado?: boolean; endereco_anterior?: string | null; endereco_novo?: string | null;
  localizacao_atualizada?: boolean;
};
export type OnedocContexto = {
  escopo?: string; secretarias?: { id: string | null; nome: string }[];
};
export function resumoResultados(resultados: OnedocResultado[]) {
  const salvos = resultados.filter((r) => !r.erro);
  return {
    enderecos: salvos.filter((r) => r.endereco_atualizado === true).length,
    concluidos: salvos.filter((r) => r.concluido === true).length,
    erros: resultados.filter((r) => !!r.erro).length,
  };
}