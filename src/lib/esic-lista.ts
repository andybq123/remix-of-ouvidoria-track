/** Campos leves do cartão, incluindo a entrada de prazo exigida pelo detalhe compartilhado. */
export const COLUNAS_CARTAO_ESIC = "id, numero, numero_esic, tipo, prorrogado, assunto, solicitante, status, data_abertura, data_conclusao, secretarias(nome)";

/** Chave "AAAA-MM" do mês de abertura, lida da data como gravada (sem fuso). */
export function mesDoPedido(dataAbertura: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(dataAbertura ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}

export function mesesDisponiveisEsic(lista: { data_abertura?: string | null }[]): string[] {
  return [...new Set(lista.map(p => mesDoPedido(p.data_abertura)).filter(Boolean) as string[])].sort().reverse();
}

export function filtrarEsicPorMes<T extends { data_abertura?: string | null }>(lista: T[], mes: string): T[] {
  if (mes === "todos") return lista;
  return lista.filter(p => mesDoPedido(p.data_abertura) === mes);
}
