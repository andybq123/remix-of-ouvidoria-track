export type Alteracao1doc = { id: string; campo: string; acao: string; autor_nome: string | null; valor_novo: string | null; contexto?: { reversao_de?: string | null } | null };

export function podeReverter1doc(h: Alteracao1doc, historico: Alteracao1doc[], protocolo: Record<string, unknown>) {
  if (h.autor_nome !== "Agente 1Doc" || h.acao !== "update" || !["assunto", "categoria", "endereco", "status", "data_conclusao"].includes(h.campo)) return false;
  if (historico.some((x) => x.contexto?.reversao_de === h.id)) return false;
  const maisRecente = historico.find((x) => x.campo === h.campo);
  return maisRecente?.id === h.id && (protocolo[h.campo] == null ? null : String(protocolo[h.campo])) === h.valor_novo;
}