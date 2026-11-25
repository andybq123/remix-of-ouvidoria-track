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
  acaoConferirProtocolo,
  classificarIntencao,
  destinoNavegacao,
  extrairNumeroProtocolo,
  extrairSecretaria,
  respostaDeterministica,
  type AtrasadaChat,
  type ResumoChat,
} from "@/lib/muse-chat";

/**
 * Chat do Ouvidorzinho — perguntas sobre os dados do OuviDesk.
 *
 * O Ouvidorzinho é o assistente do OuviDesk movido pelo Muse. Ele pede,
 * acompanha e reporta a conferência no 1Doc: quando o usuário pede para
 * conferir uma ouvidoria (ou as atrasadas), a verificação é enfileirada
 * e o agente do 1Doc na VPS — o único componente que pode abrir a página
 * do 1Doc (o servidor web não pode rodar navegador) — confere e, se
 * houver a linha "deu baixa", a ouvidoria é concluída no OuviDesk pelo
 * fluxo auditado existente. O chat nunca conclui um protocolo
 * diretamente nem abre a página do 1Doc por conta própria.
 *
 * Além das perguntas, o Ouvidorzinho navega: quando o usuário pede para
 * abrir uma tela (Atrasados, Agente 1Doc, Dashboard, Configurações > IA…),
 * o chat devolve a ação de navegação e a UI mostra o botão para abrir.
 * Nenhuma ação que muda estado é feita pelo chat além de enfileirar a
 * conferência (admin-only, com confirmação na UI).
 *
 * A resposta vem dos dados reais (protocolos visíveis para o usuário,
 * prazos de prazo.ts, jobs do 1Doc), reescrita em linguagem natural
 * pela IA já configurada no sistema (Groq/Gemini, via ai-chat.server.ts).
 * Sem IA configurada, a resposta é o texto determinístico de
 * muse-chat.ts, com os mesmos números.
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

    // Ouvidorzinho desabilitado para o usuário (aba Usuários): o chat não
    // responde. Só o `false` estrito bloqueia (fail-open sem a função).
    const { data: podeUsar } = await context.supabase.rpc("posso_usar_ouvidorzinho");
    if (podeUsar === false) {
      throw new Error("O Ouvidorzinho está desabilitado para o seu usuário.");
    }

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
          id: achado.id,
          numero: achado.numero,
          assunto: achado.assunto ?? "Sem assunto",
          secretaria: achado.secretarias?.nome ?? "Sem secretaria",
          status: achado.status,
          situacao: sla.situacao,
          dias: sla.dias,
          prazoFinal: prazoFinal.toISOString().slice(0, 10),
          url: achado.url ?? null,
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
      vencendoSemana: vencendo.length,
      aguardando: op.aguardando,
      porSecretaria: [...porSecretariaMap.values()],
      atrasadasTop: atrasadas.slice(0, 10),
      vencendoTop: vencendo.slice(0, 10),
      protocolo,
      secretariaBuscada: extrairSecretaria(
        pergunta,
        [...porSecretariaMap.values()].map((s) => s.nome),
      ),
      ultimoJob: null,
    };

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
    resumo.ultimoJob = ultimoJob;

    // Ação: conferir no 1Doc. Em lote para as atrasadas (só admin) e
    // unitária para um protocolo específico (só admin, não concluído e
    // com link do 1Doc — ver acaoConferirProtocolo em muse-chat.ts).
    // Em ambos os casos a conferência só é enfileirada: o agente do
    // 1Doc na VPS confere e só conclui com a linha "deu baixa".
    // Navegação não muda estado: devolve só o destino para a UI abrir.
    const destino = destinoNavegacao(pergunta);
    const elegiveis = atrasadas.filter((a) => /1doc/i.test(a.url ?? ""));
    const acao =
      intencao === "navegacao" && destino
        ? { tipo: "navegar" as const, rota: destino.rota, rotulo: destino.rotulo }
        : intencao === "atrasadas" && elegiveis.length > 0 && admin
          ? {
              tipo: "conferir-atrasadas" as const,
              total: elegiveis.length,
              protocoloIds: elegiveis.map((a) => a.id),
              numeros: elegiveis.slice(0, 10).map((a) => a.numero),
            }
          : intencao === "protocolo"
            ? acaoConferirProtocolo(resumo.protocolo, admin)
            : null;

    const contextoIA = {
      resumo: {
        total: resumo.total,
        emAndamento: resumo.ativos,
        concluidos: resumo.concluidos,
        atrasados: resumo.vencidos,
        vencendoHoje: resumo.venceHoje,
        vencendo3Dias: resumo.vence3Dias,
        vencendoSemana: resumo.vencendoSemana,
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
      secretariaBuscada: resumo.secretariaBuscada,
      protocolo: resumo.protocolo,
      ultimoJobMuse: ultimoJob,
      navegacao: destino,
    };

    let resposta = respostaDeterministica(intencao, resumo);
    let fonte: "ia" | "regras" = "regras";
    if (intencao === "navegacao" && destino) {
      resposta = `Claro — vou abrir ${destino.rotulo} para você. É só tocar no botão abaixo.`;
    }
    try {
      const { aiChat } = await import("./ai-chat.server");
      const texto = await aiChat({
        messages: [
          {
            role: "system",
            content:
              "Você é o Ouvidorzinho, o assistente do OuviDesk movido pelo Muse, sistema de gestão de ouvidorias da Prefeitura de Brusque. " +
              "Responda em português, de forma curta e direta, usando SOMENTE os dados fornecidos abaixo. " +
              "Nunca invente números, nomes ou prazos. Se a resposta não estiver nos dados, diga que não sabe. " +
              "Quando o usuário pedir para abrir uma tela, o campo navegacao traz o destino: confirme que vai abrir aquela tela. " +
              "Você pede, acompanha e reporta a conferência no 1Doc: quando o usuário pedir para conferir uma ouvidoria, " +
              "ofereça a conferência e, depois dela, reporte o resultado (baixada ou ainda em aberto). A leitura da página " +
              "do 1Doc é feita pelo agente do 1Doc na VPS, e se houver baixa lá a ouvidoria é concluída no OuviDesk pelo " +
              "fluxo auditado. Nunca afirme que você mesmo abriu a página do 1Doc ou concluiu um protocolo diretamente. " +
              "Você nunca conclui, edita ou exclui protocolos diretamente.",
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
    // A resposta determinística já explica esses casos; a IA pode omitir,
    // então completa só quando a resposta veio da IA.
    if (intencao === "protocolo" && fonte === "ia" && resumo.protocolo) {
      if (resumo.protocolo.status === "concluido") {
        resposta += " Ela já está concluída no OuviDesk, então não há o que conferir no 1Doc.";
      } else if (!/1doc/i.test(resumo.protocolo.url ?? "")) {
        resposta +=
          " Ela não tem link do 1Doc cadastrado, então não dá para conferi-la automaticamente no 1Doc.";
      } else if (!admin) {
        resposta +=
          " A conferência no 1Doc precisa de um administrador — peça a um admin para conferir essa ouvidoria.";
      }
    }

    return { resposta, intencao, fonte, acao, resumo, isAdmin: admin };
  });
