import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { OnedocAgentButton } from "@/components/onedoc-agent-button";
import { validarFiltrosProtocolos } from "@/lib/protocolos-listagem";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { perguntarAssistenteMuse } from "@/lib/muse-chat.functions";
import { CAPACIDADES_OUVIDORIZINHO, LIMITES_OUVIDORIZINHO } from "@/lib/muse-chat";
import type { OnedocJob } from "@/lib/onedoc.functions";

const SUGESTOES = [
  "Quantas ouvidorias estão atrasadas?",
  "Quais vencem esta semana?",
  "Me dá um resumo",
  "Qual foi a última conferência no 1Doc?",
  "Abrir a tela de Atrasados",
  "Confere as atrasadas no 1Doc",
] as const;

type Mensagem = {
  papel: "usuario" | "assistente";
  texto: string;
  fonte?: "ia" | "regras";
  acao?:
    | {
        tipo: "conferir-atrasadas";
        total: number;
        protocoloIds: string[];
        numeros: string[];
      }
    | { tipo: "conferir-protocolo"; protocoloId: string; numero: string; total: 1 }
    | { tipo: "navegar"; rota: string; rotulo: string }
    | null;
};

/**
 * Texto do resultado de uma conferência unitária, a partir dos campos
 * reais do job (resultados[0]: concluido/data_conclusao/erro/situacao).
 */
function textoResultadoConferenciaUnitaria(job: OnedocJob, numero: string): string {
  if (job.status === "erro") {
    return (
      `Conferência da ouvidoria ${numero} no 1Doc terminou com erro` +
      (job.mensagem ? `: ${job.mensagem}` : ".")
    );
  }
  const r = (job.resultados ?? [])[0];
  if (r?.erro) return `Conferência da ouvidoria ${numero} no 1Doc: erro — ${r.erro}`;
  if (r?.concluido) {
    return (
      `Conferência da ouvidoria ${numero} no 1Doc: já foi baixada lá` +
      (r.data_conclusao ? ` em ${r.data_conclusao}` : "") +
      " — concluída no OuviDesk."
    );
  }
  return (
    `Conferência da ouvidoria ${numero} no 1Doc: ainda não foi baixada lá` +
    (r?.situacao ? ` (situação no 1Doc: ${r.situacao})` : "") +
    " — continua em aberto no OuviDesk."
  );
}

/**
 * Botão para abrir a tela pedida ao Ouvidorizinho. As rotas são literais
 * (o roteador tipa cada `to`), por isso o mapa explícito em vez de
 * interpolar a string da ação.
 */
function BotaoNavegar({ rota, rotulo }: { rota: string; rotulo: string }): ReactNode {
  const label = (
    <>
      Abrir {rotulo} <ArrowRight className="h-4 w-4 ml-1" />
    </>
  );
  switch (rota) {
    case "/atrasados":
      return (
        <Button size="sm" asChild>
          <Link to="/atrasados">{label}</Link>
        </Button>
      );
    case "/agente-1doc":
      return (
        <Button size="sm" asChild>
          <Link to="/agente-1doc">{label}</Link>
        </Button>
      );
    case "/dashboard":
      return (
        <Button size="sm" asChild>
          <Link to="/dashboard">{label}</Link>
        </Button>
      );
    case "/ia-config":
      return (
        <Button size="sm" asChild>
          <Link to="/ia-config">{label}</Link>
        </Button>
      );
    case "/muse":
      return (
        <Button size="sm" asChild>
          <Link to="/muse">{label}</Link>
        </Button>
      );
    case "/protocolos":
      return (
        <Button size="sm" asChild>
          <Link to="/protocolos" search={validarFiltrosProtocolos({})}>
            {label}
          </Link>
        </Button>
      );
    case "/relatorios":
      return (
        <Button size="sm" asChild>
          <Link to="/relatorios">{label}</Link>
        </Button>
      );
    case "/tarefas":
      return (
        <Button size="sm" asChild>
          <Link to="/tarefas">{label}</Link>
        </Button>
      );
    case "/mapa":
      return (
        <Button size="sm" asChild>
          <Link to="/mapa">{label}</Link>
        </Button>
      );
    case "/saude":
      return (
        <Button size="sm" asChild>
          <Link to="/saude">{label}</Link>
        </Button>
      );
    default:
      return null;
  }
}

/**
 * Painel de conversa do Ouvidorizinho, o assistente do OuviDesk movido
 * pelo Muse. Usado na página /muse-chat e no drawer do mascote flutuante.
 *
 * O que ele pode e não pode fazer está no cabeçalho: responde e navega
 * com os dados que o usuário pode ver, pede conferências no 1Doc
 * (enfileiradas, admin-only, com confirmação) e nunca conclui, edita
 * ou exclui protocolos diretamente.
 */
export function MuseChatPanel({
  alturaMensagens,
  onPensandoChange,
}: {
  alturaMensagens?: string;
  /** Avisado quando o assistente começa/termina de buscar uma resposta — o mascote mostra a bola de cristal enquanto pensa. */
  onPensandoChange?: (pensando: boolean) => void;
}) {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const perguntar = useServerFn(perguntarAssistenteMuse);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    onPensandoChange?.(enviando);
  }, [enviando, onPensandoChange]);

  async function enviar(texto: string) {
    const q = texto.trim();
    if (!q || enviando) return;
    setPergunta("");
    setMensagens((ms) => [...ms, { papel: "usuario", texto: q }]);
    setEnviando(true);
    try {
      const r = await perguntar({ data: { pergunta: q } });
      setMensagens((ms) => [
        ...ms,
        { papel: "assistente", texto: r.resposta, fonte: r.fonte, acao: r.acao },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Não foi possível responder agora.";
      setMensagens((ms) => [
        ...ms,
        { papel: "assistente", texto: `Não consegui responder: ${msg}` },
      ]);
      toast.error("Falha ao perguntar ao Ouvidorizinho");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img
            src="/ouvidorizinho.png"
            alt="Ouvidorizinho"
            className="h-10 w-10 rounded-full border object-cover"
          />
          Ouvidorizinho
          <Badge variant="secondary">movido pelo Muse</Badge>
        </CardTitle>
        <CardDescription>
          Pergunte sobre os dados do OuviDesk — resumo, atrasadas, prazos, secretarias, conferências
          no 1Doc — ou peça para abrir uma tela. As respostas usam a IA já configurada em
          Configurações &gt; IA (Groq/Gemini) e, sem ela, os números diretos do sistema.
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {CAPACIDADES_OUVIDORIZINHO.map((c) => (
            <Badge key={c} variant="outline" className="font-normal">
              {c}
            </Badge>
          ))}
        </div>
        <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {LIMITES_OUVIDORIZINHO}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              onClick={() => void enviar(s)}
              disabled={enviando}
            >
              {s}
            </Button>
          ))}
        </div>

        <div className={`space-y-3 ${alturaMensagens ?? "min-h-[120px]"}`}>
          {mensagens.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma pergunta ainda nesta sessão. O histórico fica só aqui — ao sair da página, ele
              é apagado.
            </p>
          )}
          {mensagens.map((m, i) => (
            <div
              key={i}
              className={`rounded-md border p-3 text-sm ${
                m.papel === "usuario" ? "bg-primary/5 border-primary/20" : "bg-muted/40"
              }`}
            >
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                {m.papel === "usuario" ? "Você" : "Ouvidorizinho"}
                {m.papel === "assistente" && m.fonte === "regras" && (
                  <span className="font-normal"> · resposta direta dos dados (sem IA)</span>
                )}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.texto}</p>
              {m.papel === "assistente" && m.acao?.tipo === "navegar" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <BotaoNavegar rota={m.acao.rota} rotulo={m.acao.rotulo} />
                </div>
              )}
              {m.papel === "assistente" && m.acao?.tipo === "conferir-atrasadas" && (
                <div className="mt-3 rounded-md border border-primary/40 bg-background p-3 space-y-2">
                  <p className="font-medium">Conferir {m.acao.total} atrasada(s) no 1Doc?</p>
                  <p className="text-xs text-muted-foreground">
                    {m.acao.numeros.join(", ")}
                    {m.acao.total > m.acao.numeros.length &&
                      ` e mais ${m.acao.total - m.acao.numeros.length}.`}{" "}
                    A conferência roda em segundo plano no agente do 1Doc, que só conclui quem já
                    foi baixado lá.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {isAdmin ? (
                      <OnedocAgentButton
                        tipo="lote"
                        protocoloIds={m.acao.protocoloIds}
                        escopo="muse-chat:atrasadas"
                        label="Conferir agora"
                        confirmacao={`Conferir no 1Doc ${m.acao.total} ouvidoria(s) atrasada(s)? Isso roda em segundo plano.`}
                        onDone={(job) =>
                          toast.success(`Conferência iniciada (${job.processados}/${job.total})`)
                        }
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        A conferência precisa de um administrador.
                      </p>
                    )}
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/atrasados">Ver atrasadas</Link>
                    </Button>
                  </div>
                </div>
              )}
              {m.papel === "assistente" && m.acao?.tipo === "conferir-protocolo" && (
                <div className="mt-3 rounded-md border border-primary/40 bg-background p-3 space-y-2">
                  <p className="font-medium">Conferir a ouvidoria {m.acao.numero} no 1Doc?</p>
                  <p className="text-xs text-muted-foreground">
                    Vou pedir a conferência dessa ouvidoria no 1Doc e trazer o resultado aqui no
                    chat. A leitura da página do 1Doc é feita pelo agente do 1Doc na VPS; se já foi
                    baixada lá, ela é concluída no OuviDesk.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {isAdmin ? (
                      <OnedocAgentButton
                        tipo="unitario"
                        protocoloId={m.acao.protocoloId}
                        escopo={`muse-chat:protocolo:${m.acao.protocoloId}`}
                        label="Conferir no 1Doc"
                        onDone={(job) => {
                          const numero = m.acao?.tipo === "conferir-protocolo" ? m.acao.numero : "";
                          setMensagens((ms) => [
                            ...ms,
                            {
                              papel: "assistente",
                              texto: textoResultadoConferenciaUnitaria(job, numero),
                            },
                          ]);
                          void qc.invalidateQueries({ queryKey: ["protocolos"] });
                          void qc.invalidateQueries({ queryKey: ["protocolos-dashboard"] });
                          void qc.invalidateQueries({ queryKey: ["muse-status"] });
                          toast.success("Conferência concluída — resultado no chat");
                        }}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        A conferência precisa de um administrador.
                      </p>
                    )}
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/atrasados">Ver atrasadas</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {enviando && <p className="text-sm text-muted-foreground">Pensando…</p>}
        </div>

        <div className="flex gap-2">
          <Input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void enviar(pergunta);
            }}
            placeholder="Ex.: Quantas ouvidorias estão atrasadas?"
            disabled={enviando}
            aria-label="Pergunta ao Ouvidorizinho"
          />
          <Button
            onClick={() => void enviar(pergunta)}
            disabled={enviando || pergunta.trim().length < 2}
          >
            <Send className="h-4 w-4 mr-1" /> Perguntar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
