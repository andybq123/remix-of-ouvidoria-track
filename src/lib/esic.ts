import {
  detectarPedidoEsic,
  normalizarExtracao,
  sanitizarTextoProtocolo,
} from "./protocolo-extract.shared";

/** Chave de comparação: conserva a grafia original em numero_esic. */
export function chaveNumeroEsic(numero: string): string {
  const limpo = numero.trim().replace(/[.\s]/g, "");
  const partes = limpo.match(/^(\d+)\/(\d{4})$/);
  return partes ? `${partes[1].replace(/^0+(?=\d)/, "")}/${partes[2]}` : limpo.toUpperCase();
}

/** Padrão oficial: "092/2026" (número com 3 dígitos, sem pontos ou espaços). */
export function formatarNumeroEsic(numero: string | null | undefined): string {
  const limpo = String(numero ?? "").trim().replace(/^n[ºo°.]?\s*e[\s-]?sic\s*:?\s*/i, "").replace(/[.\s]/g, "");
  const partes = limpo.match(/^(\d+)\/(\d{4})$/);
  if (!partes) return limpo;
  return `${String(parseInt(partes[1], 10)).padStart(3, "0")}/${partes[2]}`;
}

/** Extrai o formato conhecido do e-mail; não inventa número, data ou solicitante. */
export function extrairPedidoEsic(texto: string) {
  if (!detectarPedidoEsic(texto)) return null;
  const bloco = sanitizarTextoProtocolo(texto);
  // O título "Pedido de e-SIC 026/2026 recebido" prevalece sobre o Nº do corpo.
  const titulo = texto
    .slice(0, 2000)
    .match(/\b(?:e[\s-]?sic|lai)\s+(?:n[ºo°.]\s*:?\s*)?(\d[\d.]*\s*\/\s*20\d{2})/i);
  // "Nº e-SIC 092/2026" é o identificador oficial e prevalece sobre qualquer outro Nº.
  const explicito = texto.match(/N[ºo°.]?\s*e[\s-]?sic\s*:?\s*(\d[\d.]*\s*\/\s*20\d{2})/i);
  const campoNumero = bloco.match(
    /(?:^|[\s.])(?:N[ºo°.]|N[uú]mero(?:\s+do\s+pedido)?|Protocolo)\s*:\s*(\d[\d.]*\s*\/\s*20\d{2})/im,
  );
  const campo = (nome: string) =>
    bloco
      .match(
        new RegExp(
          `(?:^|\\s)${nome}:\\s*([^\\n]*?)(?=\\s+(?:N[ºo°.]|Assunto|De|Para):|\\n|$)`,
          "im",
        ),
      )?.[1]
      ?.trim() ?? "";
  const extr = normalizarExtracao({
    numero: formatarNumeroEsic(explicito?.[1] || titulo?.[1] || campoNumero?.[1] || ""),
    assunto: campo("Assunto") || "Pedido e-SIC",
    solicitante: campo("De"),
    destinatario: campo("Para"),
  });
  return { ...extr, tipo: "esic" as const, categoria: "pedido_informacao" as const };
}

/** Não conclui um pedido apenas porque seu texto menciona "concluir" ou "atendimento". */
export function acaoNotificacaoEsic(assunto: string): "conclusao" | "atualizacao" {
  return /\b(?:encerrad[oa]|conclu[ií]d[oa]|finalizad[oa]|arquivad[oa])\b/i.test(assunto)
    ? "conclusao"
    : "atualizacao";
}
