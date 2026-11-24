/**
 * Chat do Assistente Muse — intenção e resposta determinística.
 *
 * Tudo aqui é puro (sem banco, sem IA): a pergunta vira uma intenção,
 * e a resposta de reserva é montada só com os números já calculados.
 * A IA (Groq/Gemini, via ai-chat.server.ts) só reescreve esses mesmos
 * dados em linguagem natural — nunca inventa números.
 */

export type IntencaoChat =
  | "atrasadas"
  | "vencendo"
  | "resumo"
  | "protocolo"
  | "secretaria"
  | "geral";

export type AtrasadaChat = {
  id: string;
  numero: string;
  assunto: string;
  secretaria: string;
  diasAtraso: number;
  prazoFinal: string;
  url: string | null;
};

export type ResumoChat = {
  total: number;
  ativos: number;
  concluidos: number;
  vencidos: number;
  venceHoje: number;
  vence3Dias: number;
  aguardando: number;
  porSecretaria: { nome: string; total: number; vencidos: number }[];
  atrasadasTop: AtrasadaChat[];
  vencendoTop: AtrasadaChat[];
  protocolo: {
    numero: string;
    assunto: string;
    secretaria: string;
    status: string;
    situacao: string;
    dias: number;
    prazoFinal: string;
  } | null;
};

const norm = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Extrai "3.321/2026" (com ou sem ponto) de uma pergunta, se houver. */
export function extrairNumeroProtocolo(pergunta: string): string | null {
  const m = String(pergunta).match(/(\d{1,3}(?:\.\d{3})?)\s*\/\s*(\d{4})/);
  if (!m) return null;
  const num = m[1].replace(/\./g, "");
  return `${num}/${m[2]}`;
}

/** Roteia a pergunta para a intenção — ordem importa (mais específico primeiro). */
export function classificarIntencao(pergunta: string): IntencaoChat {
  const t = norm(pergunta);
  if (extrairNumeroProtocolo(pergunta)) return "protocolo";
  // Secretaria antes de atrasadas: "qual secretaria tem mais atrasadas?"
  // é uma pergunta por secretaria, e a resposta traz o ranking com atrasos.
  if (/secretaria|por (setor|area|departamento)|qual (setor|area)/.test(t)) return "secretaria";
  if (/atrasad|vencid|fora do prazo|estourad/.test(t)) return "atrasadas";
  if (/vencem|vencendo|vence.*(semana|hoje|amanha)|proxim.*venc|prazo.*(semana|curto)/.test(t)) {
    return "vencendo";
  }
  if (/resumo|quantas|quantos|total|panorama|como (esta|estao)|situacao|situacao geral/.test(t)) {
    return "resumo";
  }
  return "geral";
}

function listaAtrasadas(lista: AtrasadaChat[], limite = 5): string {
  if (!lista.length) return "nenhuma.";
  return lista
    .slice(0, limite)
    .map((a) => `${a.numero} (${a.assunto}, ${a.secretaria}, ${a.diasAtraso}d atrasado)`)
    .join("; ");
}

/**
 * Resposta montada só com os dados — usada quando a IA não está
 * configurada ou falha. Mesmos números que a IA receberia.
 */
export function respostaDeterministica(intencao: IntencaoChat, r: ResumoChat): string {
  switch (intencao) {
    case "atrasadas": {
      if (!r.vencidos) {
        return "Nenhuma ouvidoria está atrasada agora — todas estão dentro do prazo.";
      }
      return (
        `Há ${r.vencidos} ouvidoria(s) atrasada(s) no momento. ` +
        `As mais atrasadas: ${listaAtrasadas(r.atrasadasTop)}. ` +
        `Posso conferir essas atrasadas no 1Doc para ver se alguma já foi baixada lá.`
      );
    }
    case "vencendo": {
      const total = r.venceHoje + r.vence3Dias;
      if (!total) return "Nada vence nos próximos 3 dias.";
      return (
        `${r.venceHoje} vence(m) hoje e ${r.vence3Dias} vence(m) em até 3 dias. ` +
        `Entre elas: ${listaAtrasadas(r.vencendoTop)}.`
      );
    }
    case "secretaria": {
      if (!r.porSecretaria.length) return "Não há protocolos por secretaria no período.";
      const top = [...r.porSecretaria].sort((a, b) => b.vencidos - a.vencidos || b.total - a.total);
      return `Por secretaria: ${top
        .slice(0, 5)
        .map((s) => `${s.nome} (${s.total} no total, ${s.vencidos} atrasado(s))`)
        .join("; ")}.`;
    }
    case "protocolo": {
      if (!r.protocolo) return "Não encontrei esse número entre os protocolos que você pode ver.";
      const p = r.protocolo;
      return (
        `Ouvidoria ${p.numero} (${p.assunto}, ${p.secretaria}): status ${p.status}, ` +
        `situação ${p.situacao}, prazo final ${p.prazoFinal} (${p.dias < 0 ? `${Math.abs(p.dias)}d atrasado` : p.dias === 0 ? "vence hoje" : `faltam ${p.dias}d`}).`
      );
    }
    case "resumo":
      return (
        `Resumo: ${r.total} protocolo(s) no total, ${r.ativos} em andamento e ${r.concluidos} concluído(s). ` +
        `${r.vencidos} atrasado(s), ${r.venceHoje} vencendo hoje, ${r.vence3Dias} vencendo em até 3 dias e ${r.aguardando} aguardando resposta.`
      );
    default:
      return (
        `Posso responder sobre os dados do OuviDesk: ${r.total} protocolo(s) no total, ` +
        `${r.vencidos} atrasado(s) e ${r.venceHoje} vencendo hoje. Pergunte, por exemplo, ` +
        `"Quantas ouvidorias estão atrasadas?" ou "Quais vencem esta semana?".`
      );
  }
}
