import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  MusePausarButton,
  MuseStatusCard,
  resumoJob,
  useMuseStatus,
} from "@/components/muse-status-card";

export const Route = createFileRoute("/_authenticated/muse")({
  head: () => ({
    meta: [
      { title: "Assistente Muse — OuviDesk" },
      {
        name: "description",
        content: "Integração Muse: status, conferências de ouvidorias atrasadas no 1Doc e pausa.",
      },
      { property: "og:title", content: "Assistente Muse — OuviDesk" },
      {
        property: "og:description",
        content: "Integração Muse: conferências de atrasadas no 1Doc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MusePage,
});

const STATUS: Record<string, string> = {
  pendente: "aguardando",
  executando: "executando",
  concluido: "concluído",
  erro: "erro",
};

function MusePage() {
  const isAdmin = useIsAdmin();
  const { data, isLoading, error } = useMuseStatus(isAdmin);

  if (!isAdmin)
    return <p className="p-6 text-muted-foreground">Acesso restrito a administradores.</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Assistente Muse
        </h1>
        <p className="text-sm text-muted-foreground">
          O Muse é um agente externo: ele chama a API do OuviDesk para listar as ouvidorias
          atrasadas, pedir a conferência no 1Doc e acompanhar o resultado. A conferência e a baixa
          continuam sendo feitas pelo agente do 1Doc na VPS, com auditoria e reversão.
        </p>
      </div>

      <MuseStatusCard />

      <Card>
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
          <CardDescription>Três endpoints, com token próprio (MUSE_API_TOKEN).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <code className="text-xs">GET /api/public/muse/atrasadas</code> — lista as atrasadas
            elegíveis, sem alterar nada.
          </p>
          <p>
            <code className="text-xs">POST /api/public/muse/conferir-atrasadas</code> — enfileira a
            conferência. Com <code className="text-xs">simulacao: true</code> não insere nada, só
            devolve o que seria conferido.
          </p>
          <p>
            <code className="text-xs">GET /api/public/muse/jobs/{"{id}"}</code> — status e resultado
            do job, com resumo de encerradas, ainda atrasadas e erros.
          </p>
          <p className="text-muted-foreground">
            O token vive só no .env.local da VPS e no cofre do Muse — nunca no repositório e nunca
            aparece aqui. Sem ele, os endpoints respondem 500; com ele errado, 401.
          </p>
          {data && <MusePausarButton pausado={data.pausado} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de conferências do Muse</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando histórico…</p>
          ) : error ? (
            <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
          ) : !data?.jobs.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma conferência pedida pelo Muse ainda.
            </p>
          ) : (
            <div className="divide-y">
              {data.jobs.map((j) => {
                const r = resumoJob(j);
                return (
                  <div key={j.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-36 text-muted-foreground">
                      {new Date(j.created_at).toLocaleString("pt-BR")}
                    </span>
                    <Badge variant="secondary">Muse</Badge>
                    <Badge
                      variant={
                        j.status === "erro"
                          ? "destructive"
                          : j.status === "concluido"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {STATUS[j.status] ?? j.status}
                    </Badge>
                    <span>
                      {j.processados}/{j.total} conferidas · {r.encerradas} encerradas ·{" "}
                      {r.continuam} continuam atrasadas · {r.erros} erros
                    </span>
                    {j.mensagem && <span className="text-muted-foreground">— {j.mensagem}</span>}
                    <Link
                      to="/agente-1doc"
                      className="ml-auto text-primary underline underline-offset-2"
                    >
                      Ver no Agente 1Doc
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
