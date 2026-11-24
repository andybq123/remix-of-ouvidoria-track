import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { OnedocAgentButton } from "@/components/onedoc-agent-button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { perguntarAssistenteMuse } from "@/lib/muse-chat.functions";

export const Route = createFileRoute("/_authenticated/muse-chat")({
  head: () => ({
    meta: [
      { title: "Assistente Muse — OuviDesk" },
      {
        name: "description",
        content:
          "Pergunte sobre os dados do OuviDesk: atrasadas, prazos, secretarias e conferências no 1Doc.",
      },
      { property: "og:title", content: "Assistente Muse — OuviDesk" },
      { property: "og:description", content: "Pergunte sobre os dados do OuviDesk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MuseChatPage,
});

const SUGESTOES = [
  "Quantas ouvidorias estão atrasadas?",
  "Quais vencem esta semana?",
  "Confere as atrasadas no 1Doc",
] as const;

type Mensagem = {
  papel: "usuario" | "assistente";
  texto: string;
  fonte?: "ia" | "regras";
  acao?: {
    tipo: "conferir-atrasadas";
    total: number;
    protocoloIds: string[];
    numeros: string[];
  } | null;
};

function MuseChatPage() {
  const isAdmin = useIsAdmin();
  const perguntar = useServerFn(perguntarAssistenteMuse);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);

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
      toast.error("Falha ao perguntar ao Assistente");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6" /> Assistente Muse
        </h1>
        <p className="text-sm text-muted-foreground">
          Pergunte sobre os dados do OuviDesk — atrasadas, prazos, secretarias e conferências no
          1Doc. As respostas usam a IA já configurada em Configurações &gt; IA (Groq/Gemini) e, sem
          ela, os números diretos do sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Pergunte ao Assistente
            <Badge variant="secondary">dados do OuviDesk</Badge>
          </CardTitle>
          <CardDescription>
            O chat responde só com os dados que você pode ver (mesmas regras de área das telas) e
            nunca conclui um protocolo: conferir atrasadas apenas enfileira a verificação no agente
            do 1Doc.
          </CardDescription>
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

          <div className="space-y-3 min-h-[120px]">
            {mensagens.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma pergunta ainda nesta sessão. O histórico fica só aqui — ao sair da página,
                ele é apagado.
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
                  {m.papel === "usuario" ? "Você" : "Assistente Muse"}
                  {m.papel === "assistente" && m.fonte === "regras" && (
                    <span className="font-normal"> · resposta direta dos dados (sem IA)</span>
                  )}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                {m.papel === "assistente" && m.acao && (
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
    </div>
  );
}
