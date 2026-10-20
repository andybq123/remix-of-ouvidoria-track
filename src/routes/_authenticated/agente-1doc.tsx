import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { getOnedocConfig, salvarOnedocConfig } from "@/lib/onedoc.functions";
import { OnedocAgentButton } from "@/components/onedoc-agent-button";
import { OnedocBatchHistory } from "@/components/onedoc-batch-history";

export const Route = createFileRoute("/_authenticated/agente-1doc")({
  head: () => ({
    meta: [
      { title: "Agente 1Doc — OuviDesk" },
      { name: "description", content: "Configure o agente que confere no 1Doc se as ouvidorias foram baixadas e arquivadas." },
      { property: "og:title", content: "Agente 1Doc — OuviDesk" },
      { property: "og:description", content: "Conferência automática de baixa e arquivamento no 1Doc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentePage,
});

const STATUS: Record<string, string> = { pendente: "aguardando", executando: "executando", concluido: "concluído", erro: "erro" };
const TIPO: Record<string, string> = { teste: "Teste de login", unitario: "Uma ouvidoria", lote: "Todas em aberto" };

function AgentePage() {
  const isAdmin = useIsAdmin();
  const getCfg = useServerFn(getOnedocConfig);
  const salvar = useServerFn(salvarOnedocConfig);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["onedoc-config"], queryFn: () => getCfg(), enabled: isAdmin });
  const [url, setUrl] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (data) { setUrl(data.url_login); setUsuario(data.usuario); } }, [data]);

  if (!isAdmin) return <p className="p-6 text-muted-foreground">Acesso restrito a administradores.</p>;

  async function onSalvar() {
    setSalvando(true);
    try {
      await salvar({ data: { url_login: url, usuario, senha: senha || undefined } });
      setSenha("");
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["onedoc-config"] });
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Bot className="h-6 w-6" /> Agente 1Doc</h1>
        <p className="text-sm text-muted-foreground">Entra no 1Doc, abre cada ouvidoria e registra se ela foi baixada e arquivada, com as datas. Funciona apenas na VPS.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Acesso ao 1Doc</CardTitle>
          <CardDescription>A senha fica guardada de forma protegida e não volta a aparecer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
          <div className="space-y-1">
            <Label htmlFor="u">Link de login</Label>
            <Input id="u" placeholder="https://brusque.1doc.com.br" value={url} onChange={(e) => setUrl(e.target.value)} disabled={isLoading} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="us">Usuário</Label>
              <Input id="us" autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s">Senha</Label>
              <Input id="s" type="password" autoComplete="new-password" placeholder={data?.temSenha ? "•••••• (salva — deixe vazio para manter)" : ""} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSalvar} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
            <OnedocAgentButton tipo="teste" label="Testar login" size="default" />
            <OnedocAgentButton tipo="lote" label="Atualizar todas pelo 1Doc" size="default" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Últimas execuções</CardTitle></CardHeader>
        <CardContent>
          {!data?.jobs.length ? <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p> : (
            <div className="divide-y">
              {data.jobs.map((j) => (
                <div key={j.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-36 text-muted-foreground">{new Date(j.created_at).toLocaleString("pt-BR")}</span>
                  <span className="w-32">{TIPO[j.tipo] ?? j.tipo}</span>
                  <Badge variant={j.status === "erro" ? "destructive" : j.status === "concluido" ? "default" : "secondary"}>{STATUS[j.status] ?? j.status}</Badge>
                  {j.tipo !== "teste" && <span>{j.processados}/{j.total} conferidas · {j.atualizados} concluídas · {j.erros} erros</span>}
                  {j.mensagem && <span className="text-muted-foreground">— {j.mensagem}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <OnedocBatchHistory />
    </div>
  );
}
