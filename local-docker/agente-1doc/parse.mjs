// Lê o texto da página de uma ouvidoria no 1Doc e encontra baixa e arquivamento.
// Compartilhado pelo agente da VPS e pelos testes do app.

const RE_CARIMBO = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/g;

/** dd/mm/aaaa hh:mm[:ss] (horário de Brasília) -> ISO UTC */
export function dataBrParaIso(d, m, a, h = "00", mi = "00", s = "00") {
  const iso = `${a}-${m}-${d}T${h}:${mi}:${s || "00"}-03:00`;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Último carimbo "dd/mm/aaaa hh:mm:ss" que aparece antes da posição `pos`. */
function carimboAntes(texto, pos) {
  let ultimo = null;
  RE_CARIMBO.lastIndex = 0;
  let m;
  while ((m = RE_CARIMBO.exec(texto)) !== null) {
    if (m.index >= pos) break;
    ultimo = m;
  }
  return ultimo ? dataBrParaIso(ultimo[1], ultimo[2], ultimo[3], ultimo[4], ultimo[5], ultimo[6]) : null;
}

/**
 * @param {string} texto innerText da página do 1Doc
 * @returns {{situacao: "arquivada"|"baixada"|"em_andamento", baixado_em: string|null, arquivado_em: string|null, setor: string|null}}
 */
export function analisarTexto1doc(texto) {
  const t = String(texto || "").replace(/\r/g, "");
  let baixado_em = null;
  let setor = null;
  const reBaixa = /([^\n]*?)\s*deu baixa[^\n]*?\bem\s+(\d{2})\/(\d{2})\/(\d{4})(?:\s*(?:às|as|-)?\s*(\d{2}):(\d{2})(?::(\d{2}))?)?/gi;
  let m;
  let melhor = null;
  while ((m = reBaixa.exec(t)) !== null) {
    const iso = dataBrParaIso(m[2], m[3], m[4], m[5] || "00", m[6] || "00", m[7] || "00")
      ?? carimboAntes(t, m.index);
    if (iso && (!melhor || iso > melhor)) {
      melhor = iso;
      setor = m[1].replace(/\*+/g, "").trim() || null;
    }
  }
  baixado_em = melhor;

  let arquivado_em = null;
  const reArq = /\barquivou\b/gi;
  while ((m = reArq.exec(t)) !== null) {
    const iso = carimboAntes(t, m.index);
    if (iso && (!arquivado_em || iso > arquivado_em)) arquivado_em = iso;
  }
  const marcador = /arquivado\s*\u2705/i.test(t);

  const situacao = arquivado_em || marcador ? "arquivada" : baixado_em ? "baixada" : "em_andamento";
  return { situacao, baixado_em, arquivado_em, setor, endereco: extrairEndereco(t) };
}

/** "Endereço: R. João XXIII, Brusque - SC, 88357, Brasil. . CEP: ..." -> "R. João XXIII, Brusque - SC, 88357, Brasil" */
export function extrairEndereco(texto) {
  const m = String(texto || "").match(/Endere[çc]o\s*:\s*([^\n]+)/i);
  if (!m) return null;
  let e = m[1].split(/\.?\s*\.?\s*CEP\s*:/i)[0];
  e = e.replace(/[\s.]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return e.length >= 5 ? e.slice(0, 300) : null;
}

/** Decide o que gravar no protocolo a partir da análise. */
export function atualizacaoProtocolo(protocolo, analise) {
  const upd = {
    onedoc_situacao: analise.situacao,
    onedoc_baixado_em: analise.baixado_em,
    onedoc_arquivado_em: analise.arquivado_em,
    onedoc_verificado_em: new Date().toISOString(),
  };
  if (analise.endereco && !String(protocolo.endereco || "").trim()) upd.endereco = analise.endereco;
  const fim = analise.baixado_em || analise.arquivado_em;
  if (protocolo.status !== "concluido" && analise.situacao !== "em_andamento" && fim) {
    upd.status = "concluido";
    // data_conclusao é "date": usa o dia em Brasília
    upd.data_conclusao = new Date(new Date(fim).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  }
  return upd;
}
