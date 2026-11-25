import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Container,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  Server,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  formatarBytes,
  formatarIdade,
  formatarPercentual,
  formatarUptime,
  ordenarContainers,
  type VpsStatsResposta,
} from "@/lib/vps-stats";

export const Route = createFileRoute("/_authenticated/configuracoes/vps")({
  head: () => ({
    meta: [
      { title: "Estatísticas da VPS — OuviDesk" },
      { name: "description", content: "CPU, memória, disco, uptime e containers da VPS do OuviDesk." },
      { property: "og:title", content: "Estatísticas da VPS — OuviDesk" },
      { property: "og:description", content: "CPU, memória, disco, uptime e containers da VPS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VpsStatsPage,
});

const KEY = ["vps-stats"];

function VpsStatsPage() {
  const isAdmin = useIsAdmin();
  const { data, error: erroConsulta, isPending, isFetching, refetch } = useQuery({
    queryKey: KEY,
    enabled: isAdmin,
    refetchInterval: 30_000,
    queryFn: async (): Promise<VpsStatsResposta> => {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const r = await fetch("/api/vps-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Não foi possível carregar as estatísticas da VPS.");
      return (await r.json()) as VpsStatsResposta;
    },
  });

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito a administradores.</p>;

  const coleta = data?.coleta ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          to="/configuracoes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para Configurações
        </Link>
        <header className="mt-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight">Estatísticas da VPS</h1>
            <p className="text-sm text-muted-foreground">
              CPU, memória, disco, uptime e containers do servidor onde o OuviDesk roda.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </header>
        {data?.coletadoEm && (
          <p className="mt-2 text-xs text-muted-foreground">
            Última coleta {formatarIdade(data.idadeSegundos ?? 0)} ·{" "}
            {new Date(data.coletadoEm).toLocaleString("pt-BR")}
            {data.desatualizado && (
              <Badge variant="destructive" className="ml-2">
                Desatualizado
              </Badge>
            )}
          </p>
        )}
      </div>

      {isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando estatísticas…
        </p>
      )}

      {erroConsulta && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Não foi possível carregar as estatísticas da VPS. Confira a conexão e tente novamente.
            </p>
          </CardContent>
        </Card>
      )}

      {!isPending && !erroConsulta && !coleta && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" /> Coletando as primeiras estatísticas…
            </CardTitle>
            <CardDescription>
              O coletor da VPS grava as estatísticas a cada 1 minuto. Os dados aparecem aqui após
              a próxima coleta. Se nada aparecer, rode a atualização na VPS (Configurações →
              Atualização) para instalar o coletor.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {coleta && data?.desatualizado && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Dados desatualizados — última coleta{" "}
            {formatarIdade(data.idadeSegundos ?? 0)}. Verifique se o coletor está ativo na VPS
            (o cron do root roda o coletor a cada 1 minuto).
          </p>
        </div>
      )}

      {coleta && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" /> CPU
                </CardTitle>
                <CardDescription>
                  Uso médio do processador e carga média (load average 1, 5 e 15 min).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-semibold">
                  {formatarPercentual(coleta.cpu.usoPercentual)}
                </div>
                <Progress value={coleta.cpu.usoPercentual} />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">1 min</div>
                    {coleta.load[0].toFixed(2).replace(".", ",")}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">5 min</div>
                    {coleta.load[1].toFixed(2).replace(".", ",")}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">15 min</div>
                    {coleta.load[2].toFixed(2).replace(".", ",")}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{coleta.cpu.nucleos} núcleos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MemoryStick className="h-5 w-5" /> Memória RAM
                </CardTitle>
                <CardDescription>Memória usada em relação ao total instalado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-semibold">
                  {formatarBytes(coleta.memoria.usadaBytes)}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    de {formatarBytes(coleta.memoria.totalBytes)}
                  </span>
                </div>
                <Progress
                  value={
                    coleta.memoria.totalBytes > 0
                      ? (coleta.memoria.usadaBytes / coleta.memoria.totalBytes) * 100
                      : 0
                  }
                />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Livre</div>
                    {formatarBytes(coleta.memoria.livreBytes)}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Disponível</div>
                    {formatarBytes(coleta.memoria.disponivelBytes)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" /> Disco
                </CardTitle>
                <CardDescription>
                  Espaço usado no disco raiz ({coleta.disco.pontoMontagem}).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-semibold">
                  {formatarPercentual(coleta.disco.usoPercentual)}
                </div>
                <Progress value={coleta.disco.usoPercentual} />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Usado</div>
                    {formatarBytes(coleta.disco.usadoBytes)} de{" "}
                    {formatarBytes(coleta.disco.totalBytes)}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Livre</div>
                    {formatarBytes(coleta.disco.livreBytes)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" /> Uptime
                </CardTitle>
                <CardDescription>Tempo desde a última inicialização da instância.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-semibold">
                  {formatarUptime(coleta.uptimeSegundos)}
                </div>
                <p className="text-sm text-muted-foreground">
                  Host: {coleta.hostname ?? "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Container className="h-5 w-5" /> Containers
              </CardTitle>
              <CardDescription>
                Estado dos containers Docker na VPS no momento da coleta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {coleta.containers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum container listado — o Docker pode não estar respondendo no host.
                </p>
              ) : (
                <ul className="divide-y">
                  {ordenarContainers(coleta.containers).map((c) => (
                    <li key={c.nome} className="flex items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {c.estado}
                      </span>
                      <Badge variant={c.emExecucao ? "default" : "secondary"}>
                        {c.emExecucao ? "em execução" : "parado"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" /> Sistema
              </CardTitle>
              <CardDescription>Versões em execução no servidor.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Node.js (host)</dt>
                  <dd className="font-medium">{coleta.node ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Versão instalada do app</dt>
                  <dd className="font-medium">{coleta.appVersao ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Commit do código</dt>
                  <dd className="font-medium">{coleta.appCommit ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Coleta</dt>
                  <dd className="font-medium">
                    {new Date(coleta.coletadoEm).toLocaleString("pt-BR")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
