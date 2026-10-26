import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldAlert, Clock, Server } from "lucide-react";
import { getLicencaEstado } from "@/lib/licenca.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/licenca")({
  head: () => ({
    meta: [
      { title: "Licença · OuviDesk" },
      { name: "description", content: "Situação da licença do OuviDesk e data da última verificação." },
      { property: "og:title", content: "Licença · OuviDesk" },
      { property: "og:description", content: "Situação da licença do OuviDesk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LicencaPage,
});

function LicencaPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["licenca-estado-detalhe"],
    queryFn: () => getLicencaEstado(),
    refetchInterval: 10_000,
  });
  const bloqueado = !!data?.bloqueado;
  const verificado = data?.verificado_em ? new Date(data.verificado_em).toLocaleString("pt-BR") : "Ainda não verificada";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/configuracoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Configurações
      </Link>
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Licença</h1>
          <p className="text-sm text-muted-foreground">Situação da licença desta instalação.</p>
        </div>
      </header>

      <Card className={bloqueado ? "border-destructive/60" : ""}>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          {bloqueado
            ? <ShieldAlert className="h-12 w-12 shrink-0 text-destructive" />
            : <ShieldCheck className="h-12 w-12 shrink-0 text-primary" />}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{isLoading ? "Carregando…" : bloqueado ? "Licença bloqueada" : "Licença ativa"}</span>
              {!isLoading && <Badge variant={bloqueado ? "destructive" : "secondary"}>{bloqueado ? "Somente consulta" : "Liberado"}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {bloqueado
                ? (data?.motivo || "O sistema está em modo somente consulta. Entre em contato com o fornecedor da licença.")
                : "Todas as funções do sistema estão liberadas."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Clock className="h-4 w-4" /> Última verificação</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">{verificado}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Server className="h-4 w-4" /> Servidor de licenças</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">licenca.chatizy.com.br</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Como trocar a licença</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>A chave fica guardada somente na VPS, por segurança. Para cadastrar ou trocar, rode como root na pasta do sistema:</p>
          <pre className="rounded-md bg-muted p-3 font-mono text-xs text-foreground">bash deploy.sh ferramentas</pre>
          <p>e escolha “Trocar a licença”. A verificação é automática e esta tela se atualiza sozinha.</p>
        </CardContent>
      </Card>
    </div>
  );
}
