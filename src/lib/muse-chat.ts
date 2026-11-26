/**
 * Chat do Ouvidorzinho — intenção e resposta determinística.
 *
 * O Ouvidorzinho é o assistente do OuviDesk movido pelo Muse: ele é o
 * "cérebro" do sistema para perguntas e navegação, mas nunca escreve
 * direto em protocolos nem conclui nada por conta própria. Tudo aqui é
 * puro (sem banco, sem IA): a pergunta vira uma intenção, e a resposta
 * de reserva é montada só com os números já calculados. A IA
 * (Groq/Gemini, via ai-chat.server.ts) só reescreve esses mesmos dados
 * em linguagem natural — nunca inventa números.
 *
 * O que o chat PODE fazer:
 * - responder sobre resumo operacional, atrasadas, vencimentos,
 *   protocolos por número/secretaria/status e última conferência 1Doc;
 * - sugerir e abrir a tela certa (navegação);
 * - pedir conferência no 1Doc (só enfileirando, admin-only, com
 *   confirmação — o agente do 1Doc na VPS confere e só conclui com a
 *   linha "deu baixa").
 *
 * O que o chat NÃO pode fazer:
 * - concluir, editar ou excluir protocolos diretamente;
 * - abrir a página do 1Doc por conta própria;
 * - nenhuma ação destrutiva sem confirmação explícita do usuário.
 */

export type IntencaoChat =
  | "atrasadas"
  | "vencendo"
  | "resumo"
  | "protocolo"
  | "secretaria"
  | "status"
  | "navegacao"
  | "ultima-conferencia"
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

export type AcaoChat =
  | {
      tipo: "conferir-atrasadas";
      total: number;
      protocoloIds: string[];
      numeros: string[];
    }
  | { tipo: "conferir-protocolo"; protocoloId: string; numero: string; total: 1 }
  | { tipo: "navegar"; rota: string; rotulo: string };

/**
 * Decide se uma pergunta sobre um protocolo específico pode virar uma
 * conferência unitária no 1Doc. Só admin, protocolo não concluído e com
 * link do 1Doc. Sem link, já concluído ou sem admin: sem ação.
 */
export function acaoConferirProtocolo(
  protocolo: ResumoChat["protocolo"],
  admin: boolean,
): Extract<AcaoChat, { tipo: "conferir-protocolo" }> | null {
  if (!admin || !protocolo) return null;
  if (protocolo.status === "concluido") return null;
  if (!/1doc/i.test(protocolo.url ?? "")) return null;
  return {
    tipo: "conferir-protocolo",
    protocoloId: protocolo.id,
    numero: protocolo.numero,
    total: 1,
  };
}

export type ResumoChat = {
  total: number;
  ativos: number;
  concluidos: number;
  vencidos: number;
  venceHoje: number;
  vence3Dias: number;
  /** Vencem em até 7 dias (esta semana), incluindo hoje. */
  vencendoSemana: number;
  aguardando: number;
  porSecretaria: { nome: string; total: number; vencidos: number }[];
  atrasadasTop: AtrasadaChat[];
  vencendoTop: AtrasadaChat[];
  protocolo: {
    id: string;
    numero: string;
    assunto: string;
    secretaria: string;
    status: string;
    situacao: string;
    dias: number;
    prazoFinal: string;
    url: string | null;
  } | null;
  /** Nome da secretaria citada na pergunta, se alguma casou. */
  secretariaBuscada: string | null;
  /** Última conferência pedida pelo Muse, em texto, ou null. */
  ultimoJob: string | null;
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

/**
 * Destinos que o Ouvidorzinho pode abrir, por palavra-chave.
 * A rota é um caminho interno do OuviDesk, nunca URL externa.
 */
export const DESTINOS_NAVEGACAO = [
  { chaves: ["atrasad"], rota: "/atrasados", rotulo: "Atrasados" },
  { chaves: ["agente 1doc", "1doc"], rota: "/agente-1doc", rotulo: "Agente 1Doc" },
  { chaves: ["dashboard", "painel"], rota: "/dashboard", rotulo: "Dashboard" },
  {
    chaves: ["configuracoes", "configuracao", " ia", "token"],
    rota: "/ia-config",
    rotulo: "Configurações > IA",
  },
  { chaves: ["assistente", "muse", "ouvidorzinho"], rota: "/muse", rotulo: "Ouvidorzinho" },
  { chaves: ["protocolo"], rota: "/protocolos", rotulo: "Protocolos" },
  { chaves: ["relatorio"], rota: "/relatorios", rotulo: "Relatórios" },
  { chaves: ["triagem", "tarefa"], rota: "/tarefas", rotulo: "Triagem" },
  { chaves: ["mapa"], rota: "/mapa", rotulo: "Mapa" },
  { chaves: ["saude"], rota: "/saude", rotulo: "Saúde" },
] as const;

export type DestinoNavegacao = { rota: string; rotulo: string };

/**
 * Devolve o destino de navegação quando a pergunta pede explicitamente
 * para abrir/ir/mostrar uma tela. Sem verbo de navegação, não há destino
 * — "Quantas atrasadas?" é pergunta de dados, não pedido para abrir a tela.
 */
export function destinoNavegacao(pergunta: string): DestinoNavegacao | null {
  const t = norm(pergunta);
  if (
    !/abrir|abra|ir para|vai para|mostrar|mostre|levar|leve|acessar|acesse|quero ver|onde (fica|vejo|esta|encontro)|como (acesso|chego)|me leva|abre/.test(
      t,
    )
  ) {
    return null;
  }
  for (const d of DESTINOS_NAVEGACAO) {
    if (d.chaves.some((c) => t.includes(c))) return { rota: d.rota, rotulo: d.rotulo };
  }
  return null;
}

/**
 * Casa o nome de uma secretaria citada na pergunta com a lista real de
 * secretarias (maior nome que aparece vence). Sem casa: null.
 * Nomes no padrão "SIGLA - Nome completo" casam pelo miolo ("saude"),
 * pela sigla sozinha ("SMS") ou por uma palavra distintiva ("obras").
 */
export function extrairSecretaria(pergunta: string, nomes: string[]): string | null {
  const t = norm(pergunta);
  let melhor: string | null = null;
  const porPalavra: string[] = [];
  for (const nome of nomes) {
    const n = norm(nome);
    if (!n) continue;
    // Nome no padrão "SIGLA - Nome completo": tira a sigla para achar o miolo.
    const semSigla = n.replace(/^[a-z]{2,10} - /, "");
    // Nome completo ("secretaria de saude") ou só o miolo ("saude").
    const curto = semSigla.replace(/^secretaria (municipal )?(de |do |da )?/, "");
    // A sigla sozinha ("SMS") também casa, como palavra inteira.
    const sigla = n.match(/^([a-z]{2,10}) - /)?.[1] ?? null;
    const casaSigla = !!sigla && new RegExp(`\\b${sigla}\\b`).test(t);
    if (
      (t.includes(n) || (curto.length >= 4 && t.includes(curto)) || casaSigla) &&
      (!melhor || n.length > norm(melhor).length)
    ) {
      melhor = nome;
    }
    // Fallback: uma palavra distintiva do miolo ("obras", "saude").
    const palavras = curto
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 5 && p !== "secretaria" && p !== "municipal");
    if (palavras.some((p) => t.includes(p))) porPalavra.push(nome);
  }
  if (melhor) return melhor;
  // O fallback por palavra só vale quando um único nome casa — senão é ambíguo.
  const unicos = [...new Set(porPalavra)];
  return unicos.length === 1 ? unicos[0] : null;
}

/** Roteia a pergunta para a intenção — ordem importa (mais específico primeiro). */
export function classificarIntencao(pergunta: string): IntencaoChat {
  const t = norm(pergunta);
  if (extrairNumeroProtocolo(pergunta)) return "protocolo";
  if (
    /ultima conferencia|conferencia.*(ultima|anterior|recente)|quando.*confer|status da integracao|integracao (do muse|muse)|como esta a integracao/.test(
      t,
    )
  ) {
    return "ultima-conferencia";
  }
  if (destinoNavegacao(pergunta)) return "navegacao";
  // Secretaria antes de atrasadas: "qual secretaria tem mais atrasadas?"
  // é uma pergunta por secretaria, e a resposta traz o ranking com atrasos.
  if (/secretaria|por (setor|area|departamento)|qual (setor|area)/.test(t)) return "secretaria";
  if (/atrasad|vencid|fora do prazo|estourad/.test(t)) return "atrasadas";
  if (/vencem|vencendo|vence.*(semana|hoje|amanha)|proxim.*venc|prazo.*(semana|curto)/.test(t)) {
    return "vencendo";
  }
  if (
    /em andamento|concluid|aguardando resposta|por status|status dos protocolos|quantos abertos/.test(
      t,
    )
  ) {
    return "status";
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
      if (!r.vencendoSemana) return "Nada vence esta semana.";
      return (
        `${r.vencendoSemana} vence(m) esta semana (em até 7 dias), sendo ${r.venceHoje} hoje e ` +
        `${r.vence3Dias} em até 3 dias. Entre elas: ${listaAtrasadas(r.vencendoTop)}.`
      );
    }
    case "secretaria": {
      if (!r.porSecretaria.length) return "Não há protocolos por secretaria no período.";
      if (r.secretariaBuscada) {
        const achada = r.porSecretaria.find(
          (s) => norm(s.nome) === norm(r.secretariaBuscada ?? ""),
        );
        if (achada) {
          return `${achada.nome}: ${achada.total} protocolo(s) no total, ${achada.vencidos} atrasado(s).`;
        }
        return `Não encontrei protocolos da secretaria "${r.secretariaBuscada}" entre os que você pode ver.`;
      }
      const top = [...r.porSecretaria].sort((a, b) => b.vencidos - a.vencidos || b.total - a.total);
      return `Por secretaria: ${top
        .slice(0, 5)
        .map((s) => `${s.nome} (${s.total} no total, ${s.vencidos} atrasado(s))`)
        .join("; ")}.`;
    }
    case "status": {
      return (
        `Por status: ${r.ativos} em andamento (não concluídos), ${r.concluidos} concluídos, ` +
        `${r.aguardando} aguardando resposta e ${r.vencidos} atrasados.`
      );
    }
    case "navegacao": {
      return "Posso abrir essa tela para você — é só tocar no botão abaixo.";
    }
    case "ultima-conferencia": {
      if (!r.ultimoJob) {
        return "Nenhuma conferência pedida pelo Muse ainda. Quando houver, eu mostro aqui o resultado (quantas foram conferidas e quantas já tinham baixa no 1Doc).";
      }
      return r.ultimoJob;
    }
    case "protocolo": {
      if (!r.protocolo) return "Não encontrei esse número entre os protocolos que você pode ver.";
      const p = r.protocolo;
      const base =
        `Ouvidoria ${p.numero} (${p.assunto}, ${p.secretaria}): status ${p.status}, ` +
        `situação ${p.situacao}, prazo final ${p.prazoFinal} (${p.dias < 0 ? `${Math.abs(p.dias)}d atrasado` : p.dias === 0 ? "vence hoje" : `faltam ${p.dias}d`}).`;
      if (p.status === "concluido") {
        return base + " Ela já está concluída no OuviDesk, então não há o que conferir no 1Doc.";
      }
      if (!/1doc/i.test(p.url ?? "")) {
        return (
          base +
          " Ela não tem link do 1Doc cadastrado, então não dá para conferi-la automaticamente no 1Doc."
        );
      }
      return (
        base + " Posso conferir essa ouvidoria no 1Doc para ver se já foi baixada lá — é só pedir."
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

/** O que o Ouvidorzinho não faz — exibido no rodapé do chat. */
export const LIMITES_OUVIDORZINHO =
  "Não concluo nem edito protocolos diretamente e não abro a página do 1Doc: conferências no 1Doc só são enfileiradas (admin, com confirmação) e executadas pelo agente do 1Doc na VPS.";
