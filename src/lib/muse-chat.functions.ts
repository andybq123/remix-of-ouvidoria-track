import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllPaginated } from "@/lib/fetch-all";
import {
  calcularPrazo,
  calcularSla,
  estavaAtrasadoNaData,
  resumoOperacional,
  situacaoProtocolo,
  type TipoProtocolo,
} from "@/lib/prazo";
import {
  classificarIntencao,
  extrairNumeroProtocolo,
  respostaDeterministica,
  type AtrasadaChat,
  type ResumoChat,
} from "@/lib/muse-chat";

/**
 * Chat do Assistente Muse — perguntas sobre os dados do OuviDesk.
 *
 * NÃO é uma sessão do Muse externa e não conclui protocolo nenhum.
 * A resposta vem dos dados reais (protocolos visíveis para o usuário,
 * prazos de prazo.ts, jobs do 1Doc), reescrita em linguagem natural
 * pela IA já configurada no sistema (Groq/Gemini, via ai-chat.server.ts).
 * Sem IA configurada, a resposta é o texto determinístico de
 * muse-chat.ts, com os mesmos números. A conferência de atrasadas só
 * enfileira no agente do 1Doc (enfileirarOnedoc) — nunca conclui direto.
 *
 * Leitura segue as regras de área do usuário: tudo é lido com o client
 * autenticado dele (context.supabase), então o RLS aplica as mesmas
 * restrições das telas. Só solicitante, relato e endereço completo ficam
 * fora do contexto enviado à IA.
 */

const PerguntaSchema = z.object({
  pergunta: z.string().trim().min(2).max(500),
});

type ProtocoloChatRow = {
  id: string;
  numero: string;
  tipo: string;
  categoria: string | null;
  assunto: string | null;
  status: string;
  secretaria_id: string | null;
  data_abertura: string;
  prorrogado: boolean | null;
  data_conclusao: string | null;
  url: string | null;
  secretarias?: { nome: string | null } | null;
};

// `any` como no assertAdmin de ai-config.functions.ts: o client do
// Supabase devolve um builder thenable, não uma Promise simples.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ehAdmin(context: any): Promise<boolean> {
  try {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return data === true;
  } catch {
    return false;
  }
}

function paraAtrasada(p: ProtocoloChatRow, refDate: Date): AtrasadaChat | null {
  const r = estavaAtrasadoNaData(
    {
      tipo: (p.tipo ?? "ouvidoria") as TipoProtocolo,
      data_abertura: p.data_abertura,
      prorrogado: !!p.prorrogado,
      status: p.status as "aberto" | "em_andamento" | "concluido",
      data_conclusao: p.data_conclusao,
    },
    refDate,
  );
  if (!r.atrasado) return null;
  return {
    id: p.id,
    numero: p.numero,
    assunto: p.assunto ?? "Sem assunto",
    secretaria: p.secretarias?.nome ?? "Sem secretaria",
    diasAtraso: r.diasAtraso,
    prazoFinal: r.prazoFinal.toISOString().slice(0, 10),
    url: p.url ?? null,
  };
}

export const perguntarAssistenteMuse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PerguntaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const pergunta = data.pergunta;
    const intencao = classificarIntencao(pergunta);
    const agora = new Date();
    const admin = await ehAdmin(context);

    const protocolos = await fetchAllPaginated<ProtocoloChatRow>((from, to) =>
      context.supabase
        .from("protocolos")
        .select(
          "id,numero,tipo,categoria,assunto,status,secretaria_id,data_abertura,prorrogado,data_conclusao,url,secretarias(nome)",
        )
        .eq("triagem_pendente", false)
        .order("data_abertura", { ascending: false })
        .range(from, to),
    );
    const rows = (protocolos ?? []) as ProtocoloChatRow[];
    const op = resumoOperacional(rows as never);

    const atrasadas = rows
      .map((p) => paraAtrasada(p, agora))
      .filter((a): a is AtrasadaChat => !!a)
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
    const vencendo = rows
      .filter((p) => p.status !== "concluido")
      .map((p) => {
        const sla = calcularSla({
          tipo: (p.tipo ?? "ouvidoria") as TipoProtocolo,
          data_abertura: p.data_abertura,
          prorrogado: !!p.prorrogado,
          status: p.status as "aberto" | "em_andamento" | "concluido",
          data_conclusao: p.data_conclusao,
        });
        return { p, sla };
      })
      .filter(({ sla }) => sla.dias >= 0 && sla.dias <= 7)
      .sort((a, b) => a.sla.dias - b.sla.dias)
      .map(({ p, sla }) => ({
        id: p.id,
        numero: p.numero,
        assunto: p.assunto ?? "Sem assunto",
        secretaria: p.secretarias?.nome ?? "Sem secretaria",
        diasAtraso: -sla.dias,
        prazoFinal: sla.prazoFinal.toISOString().slice(0, 10),
        url: p.url ?? null,
      }));

    const porSecretariaMap = new Map<string, { nome: string; total: number; vencidos: number }>();
    for (const p of rows) {
      const nome = p.secretarias?.nome ?? "Sem secretaria";
      const cur = porSecretariaMap.get(nome) ?? { nome, total: 0, vencidos: 0 };
      cur.total += 1;
      if (p.status !== "concluido" && situacaoProtocolo(p as never).situacao === "vencido") {
        cur.vencidos += 1;
      }
      porSecretariaMap.set(nome, cur);
    }

    let protocolo: ResumoChat["protocolo"] = null;
    const numeroBuscado = extrairNumeroProtocolo(pergunta);
    if (numeroBuscado) {
      const variantes = new Set([numeroBuscado]);
      const [n, ano] = numeroBuscado.split("/");
      if (n.length > 3) variantes.add(`${n.slice(0, -3)}.${n.slice(-3)}/${ano}`);
      const achado = rows.find((p) => variantes.has(p.numero));
      if (achado) {
        const sla = calcularSla({
          tipo: (achado.tipo ?? "ouvidoria") as TipoProtocolo,
          data_abertura: achado.data_abertura,
          prorrogado: !!achado.prorrogado,
          status: achado.status as "aberto" | "em_andamento" | "concluido",
          data_conclusao: achado.data_conclusao,
        });
        const { prazoFinal } = calcularPrazo({
          tipo: (achado.tipo ?? "ouvidoria") as TipoProtocolo,
          data_abertura: achado.data_abertura,
          prorrogado: !!achado.prorrogado,
        });
        protocolo = {
          numero: achado.numero,
          assunto: achado.assunto ?? "Sem assunto",
          secretaria: achado.secretarias?.nome ?? "Sem secretaria",
          status: achado.status,
          situacao: sla.situacao,
          dias: sla.dias,
          prazoFinal: prazoFinal.toISOString().slice(0, 10),
        };
      }
    }

    const resumo: ResumoChat = {
      total: rows.length,
      ativos: rows.filter((p) => p.status !== "concluido").length,
      concluidos: op.concluidos,
      vencidos: op.vencidos,
      venceHoje: op.venceHoje,
      vence3Dias: op.vence3Dias,
      aguardando: op.aguardando,
      porSecretaria: [...porSecretariaMap.values()],
      atrasadasTop: atrasadas.slice(0, 10),
      vencendoTop: vencendo.slice(0, 10),
      protocolo,
    };

    // Ação: conferir as atrasadas no 1Doc. Só monta a ação para admin;
    // ela apenas enfileira (enfileirarOnedoc) — o agente do 1Doc confere
    // e só conclui com a linha "deu baixa". Nunca conclui pelo chat.
    const elegiveis = atrasadas.filter((a) => /1doc/i.test(a.url ?? ""));
    const acao =
      intencao === "atrasadas" && elegiveis.length > 0 && admin
        ? {
            tipo: "conferir-atrasadas" as const,
            total: elegiveis.length,
            protocoloIds: elegiveis.map((a) => a.id),
            numeros: elegiveis.slice(0, 10).map((a) => a.numero),
          }
        : null;

    // Última conferência pedida pelo Muse, só para contexto da resposta.
    let ultimoJob: string | null = null;
    try {
      const { data: jobs } = await context.supabase
        .from("onedoc_jobs")
        .select("status,processados,total,atualizados,created_at")
        .contains("contexto", { origem: "muse" })
        .order("created_at", { ascending: false })
        .limit(1);
      const j = (Array.isArray(jobs) ? jobs : [])[0] as
        | {
            status?: string;
            processados?: number;
            total?: number;
            atualizados?: number;
            created_at?: string;
          }
        | undefined;
      if (j) {
        ultimoJob = `Última conferência do Muse: ${j.status} (${j.processados}/${j.total} conferidas, ${j.atualizados} concluídas) em ${j.created_at}.`;
      }
    } catch {
      ultimoJob = null;
    }

    const contextoIA = {
      resumo: {
        total: resumo.total,
        emAndamento: resumo.ativos,
        concluidos: resumo.concluidos,
        atrasados: resumo.vencidos,
        vencendoHoje: resumo.venceHoje,
        vencendo3Dias: resumo.vence3Dias,
        aguardandoResposta: resumo.aguardando,
      },
      atrasadas: resumo.atrasadasTop.map((a) => ({
        numero: a.numero,
        assunto: a.assunto,
        secretaria: a.secretaria,
        diasAtraso: a.diasAtraso,
        prazoFinal: a.prazoFinal,
      })),
      vencendo: resumo.vencendoTop.map((a) => ({
        numero: a.numero,
        assunto: a.assunto,
        secretaria: a.secretaria,
        diasRestantes: -a.diasAtraso,
        prazoFinal: a.prazoFinal,
      })),
      porSecretaria: resumo.porSecretaria,
      protocolo: resumo.protocolo,
      ultimoJobMuse: ultimoJob,
    };

    let resposta = respostaDeterministica(intencao, resumo);
    let fonte: "ia" | "regras" = "regras";
    try {
      const { aiChat } = await import("./ai-chat.server");
      const texto = await aiChat({
        messages: [
          {
            role: "system",
            content:
              "Você é o Assistente Muse do OuviDesk, sistema de gestão de ouvidorias da Prefeitura de Brusque. " +
              "Responda em português, de forma curta e direta, usando SOMENTE os dados fornecidos abaixo. " +
              "Nunca invente números, nomes ou prazos. Se a resposta não estiver nos dados, diga que não sabe. " +
              "Nunca diga que concluiu, baixou ou arquivou uma ouvidoria — a conferência e a baixa são feitas pelo agente do 1Doc, não por você.",
          },
          {
            role: "user",
            content: `Pergunta: ${pergunta}\nDados do sistema (JSON): ${JSON.stringify(contextoIA)}`,
          },
        ],
      });
      if (texto?.trim()) {
        resposta = texto.trim();
        fonte = "ia";
      }
    } catch {
      // Sem IA configurada (ou falha): fica a resposta determinística.
    }

    if (intencao === "atrasadas" && elegiveis.length > 0 && !admin) {
      resposta +=
        " A conferência no 1Doc precisa de um administrador — peça a um admin para conferir essas atrasadas.";
    }
    if (intencao === "atrasadas" && elegiveis.length === 0 && resumo.vencidos > 0) {
      resposta +=
        " Nenhuma das atrasadas tem link do 1Doc cadastrado, então não dá para conferi-las automaticamente.";
    }

    return { resposta, intencao, fonte, acao, resumo, isAdmin: admin };
  });
