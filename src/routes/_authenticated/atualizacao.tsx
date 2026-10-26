import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck, CircleX, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { ATUALIZACAO_ATUAL_KEY } from "@/components/atualizacao-overlay";

export const Route = createFileRoute("/_authenticated/atualizacao")({
  head: () => ({
    meta: [
      { title: "Atualização do sistema — OuviDesk" },
      { name: "description", content: "Dispare e acompanhe a atualização do sistema na VPS." },
      { property: "og:title", content: "Atualização do sistema — OuviDesk" },
      { property: "og:description", content: "Dispare e acompanhe a atualização do sistema na VPS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtualizacaoPage,
});

type Job = {
  id: string;
  status: "pendente" | "rodando" | "concluido" | "erro";
  etapa: number;
  etapas_total: number;
  mensagem: string | null;
  log: string | null;
  created_at: string;
  updated_at: string;
};

const KEY = ["atualizacao-jobs"];
const NOMES_ETAPAS = ["Baixando alterações", "Preparando a versão", "Atualizando o banco", "Trocando a versão", "Conferindo o sistema"];

function AtualizacaoPage() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data: jobs = [] } = useQuery({
    queryKey: KEY,
    enabled: isAdmin,
    refetchInterval: q =>
      q.state.data?.some((j: Job) => j.status === "pendente" || j.status === "rodando") ? 3000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atualizacao_jobs")
        .select("id, status, etapa, etapas_total, mensagem, log, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Job[];
    },
  });

  const atual = jobs.find(j => j.status === "pendente" || j.status === "rodando");

  const disparar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("atualizacao_jobs").insert({ created_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ATUALIZACAO_ATUAL_KEY });
      toast.success("Atualização solicitada. A VPS vai começar em instantes.");
    },
    onError: () => toast.error("Não foi possível solicitar a atualização"),
  });

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito a administradores.</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Atualização do sistema</CardTitle>
          <CardDescription>
            Dispara a atualização na VPS, igual ao comando <code>./atualizar.sh</code>. O sistema pode ficar alguns segundos fora do ar durante a troca.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => disparar.mutate()} disabled={disparar.isPending || !!atual}>
            {atual ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            {atual ? "Atualização em andamento…" : "Atualizar sistema agora"}
          </Button>

          {atual && (
            <div className="space-y-2 rounded-md border p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {atual.status === "pendente"
                    ? "Aguardando o serviço da VPS…"
                    : `Etapa ${atual.etapa}/${atual.etapas_total} — ${NOMES_ETAPAS[atual.etapa - 1] ?? "Atualizando"}`}
                </span>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
              <Progress value={(atual.etapa / atual.etapas_total) * 100} />
              {atual.mensagem && <p className="text-xs text-muted-foreground">{atual.mensagem}</p>}
              {atual.status === "pendente" && Date.now() - new Date(atual.created_at).getTime() > 60_000 && (
                <p className="text-xs text-destructive">
                  O serviço de atualização da VPS não respondeu. Na VPS, como root, entre na pasta <code>local-docker</code> do sistema e rode{" "}
                  <code>bash agente-atualizacao/instalar.sh</code>. O pedido é atendido assim que o serviço iniciar.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de atualizações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma atualização solicitada pelo sistema ainda.</p>}
          {jobs.map(j => (
            <div key={j.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                {j.status === "concluido" && <CircleCheck className="h-4 w-4 text-green-600" />}
                {j.status === "erro" && <CircleX className="h-4 w-4 text-destructive" />}
                {(j.status === "pendente" || j.status === "rodando") && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Badge variant={j.status === "concluido" ? "default" : j.status === "erro" ? "destructive" : "secondary"}>
                  {j.status === "pendente" ? "Na fila" : j.status === "rodando" ? "Atualizando" : j.status === "concluido" ? "Concluída" : "Erro"}
                </Badge>
                <span className="text-muted-foreground">{new Date(j.created_at).toLocaleString("pt-BR")}</span>
              </div>
              {j.mensagem && <p className="mt-1 text-xs text-muted-foreground">{j.mensagem}</p>}
              {j.log && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Ver registro</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{j.log}</pre>
                </details>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
