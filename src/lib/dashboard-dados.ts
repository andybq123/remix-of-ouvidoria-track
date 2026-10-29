/**
 * O Dashboard recebe as ouvidorias num formato compacto (uma lista de valores
 * por ouvidoria, em uma só chamada). Aqui o formato é convertido de volta para
 * o mesmo objeto que as telas já usavam, para não mudar nenhum cálculo.
 */
export const COLUNAS_DASHBOARD = [
  "id", "numero", "numero_esic", "tipo", "categoria", "assunto", "status", "secretaria_id", "local_id",
  "solicitante", "endereco", "latitude", "longitude", "data_abertura", "data_conclusao", "data_prorrogacao",
  "prorrogado", "created_at", "triagem_concluida_em", "triagem_pendente", "resolucao", "origem", "sigilo",
  "url", "responsavel_id",
] as const;

type Sec = { id: string; nome: string; sigla?: string | null; icone?: string | null };

export function montarProtocolosDashboard(linhas: unknown, secretarias: Sec[]): any[] {
  if (!Array.isArray(linhas)) return [];
  const secPorId = new Map(secretarias.map((s) => [s.id, s]));
  const n = COLUNAS_DASHBOARD.length;
  return linhas.map((l: any[]) => {
    const p: any = {};
    for (let i = 0; i < n; i++) p[COLUNAS_DASHBOARD[i]] = l[i] ?? null;
    p.prorrogado = !!p.prorrogado;
    p.triagem_pendente = !!p.triagem_pendente;
    const s = p.secretaria_id ? secPorId.get(p.secretaria_id) : undefined;
    p.secretarias = s ? { nome: s.nome, sigla: s.sigla ?? null, icone: s.icone ?? null } : null;
    p.locais = l[n] != null ? { nome: l[n] } : null;
    p.secretaria_responsaveis = l[n + 1] != null ? { nome: l[n + 1] } : null;
    return p;
  });
}
