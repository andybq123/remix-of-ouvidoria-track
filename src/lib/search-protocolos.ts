/**
 * Busca textual compartilhada (Protocolos, Saúde, Atrasados).
 * - sem acentos, sem diferenciar maiúsculas
 * - "1.991/2026" e "1991/2026" são equivalentes
 * - múltiplos termos: todos precisam aparecer, em qualquer campo/ordem
 */

const stripDots = (s: string) => s.replace(/(\d)\.(?=\d)/g, "$1");

export function normalizeTexto(s: string): string {
  return stripDots(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
}

export function termosBusca(busca: string): string[] {
  return normalizeTexto(busca).split(/\s+/).filter(Boolean);
}

/** Texto agregado e pesquisável de um protocolo. */
export function textoProtocolo(p: any): string {
  return normalizeTexto(
    [
      p?.numero,
      p?.numero_esic,
      p?.assunto,
      p?.descricao,
      p?.resolucao,
      p?.solicitante,
      p?.contato_solicitante,
      p?.endereco,
      p?.origem,
      p?.categoria,
      p?.tipo,
      p?.tipo === "esic" ? "e-SIC acesso à informação" : "",
      p?.status,
      p?.locais?.nome,
      p?.secretarias?.nome,
      p?.secretarias?.sigla,
      p?.responsavel?.nome,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/** True quando o protocolo casa com todos os termos informados. */
export function matchProtocolo(p: any, termos: string[]): boolean {
  if (termos.length === 0) return true;
  const txt = textoProtocolo(p);
  return termos.every((t) => txt.includes(t));
}

/** True quando o termo casa apenas com o número do protocolo. */
export function matchNumero(p: any, busca: string): boolean {
  const s = normalizeTexto(busca.trim());
  if (!s) return false;
  return normalizeTexto(`${p?.numero ?? ""} ${p?.numero_esic ?? ""}`).includes(s);
}
