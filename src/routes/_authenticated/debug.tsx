import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bug, Pencil, Trash2, Search, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { BACKUP_GRUPOS, BACKUP_TABELAS } from "@/lib/backup-config";
import { debugContagens, debugExcluir, debugListar, debugSalvar, debugZerar } from "@/lib/debug.functions";

export const Route = createFileRoute("/_authenticated/debug")({
  head: () => ({
    meta: [
      { title: "Debug — Controle SETA" },
      { name: "description", content: "Edite registros do sistema e zere partes dos dados." },
      { property: "og:title", content: "Debug — Controle SETA" },
      { property: "og:description", content: "Ferramentas de administração dos dados do sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebugPage,
});

const NOMES: Record<string, string> = {
  protocolos: "Protocolos",
  protocolo_historico: "Histórico de protocolos",
  protocolos_antigos_conclusoes: "Conclusões de protocolos antigos",
  secretarias: "Secretarias",
  locais: "Locais",
  secretaria_responsaveis: "Responsáveis das secretarias",
  assuntos: "Assuntos",
  allowed_emails: "E-mails autorizados",
  profiles: "Perfis de usuário",
  user_roles: "Permissões",
  email_inbox_accounts: "Contas de e-mail",
  email_inbox_log: "E-mails coletados",
  coletas: "Coletas do 1doc",
  ai_config: "Configuração de IA",
};

const resumoLinha = (r: Record<string, any>) =>
  [r.numero, r.nome, r.email, r.assunto, r.campo, r.remetente, r.provider, r.role]
    .filter(Boolean).slice(0, 3).join(" • ") || String(r.id);

function DebugPage() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const contar = useServerFn(debugContagens);
  const listar = useServerFn(debugListar);
  const salvar = useServerFn(debugSalvar);
  const excluir = useServerFn(debugExcluir);
  const zerar = useServerFn(debugZerar);

  const [tabela, setTabela] = useState<string>("protocolos");
  const [pagina, setPagina] = useState(0);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [editando, setEditando] = useState<Record<string, any> | null>(null);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [selZerar, setSelZerar] = useState<Record<string, boolean>>({});
  const [confirmacao, setConfirmacao] = useState("");
  const [zerando, setZerando] = useState(false);

  const contagens = useQuery({ queryKey: ["debug-contagens"], queryFn: () => contar(), enabled: isAdmin });
  const lista = useQuery({
    queryKey: ["debug-lista", tabela, pagina, buscaAtiva],
    queryFn: () => listar({ data: { tabela, pagina, busca: buscaAtiva } }),
    enabled: isAdmin,
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["debug-lista"] });
    qc.invalidateQueries({ queryKey: ["debug-contagens"] });
  };

  async function salvarEdicao() {
    if (!editando) return;
    let valores: Record<string, any>;
    try { valores = JSON.parse(texto); } catch { return toast.error("Texto inválido: confira vírgulas e aspas."); }
    setSalvando(true);
    try {
      await salvar({ data: { tabela, id: String(editando.id), valores } });
      toast.success("Registro salvo.");
      setEditando(null); recarregar();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  }

  async function apagar(r: Record<string, any>) {
    if (!confirm(`Apagar este registro de ${NOMES[tabela]}?\n\n${resumoLinha(r)}`)) return;
    try { await excluir({ data: { tabela, id: String(r.id) } }); toast.success("Registro apagado."); recarregar(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function executarZerar() {
    const grupos = Object.keys(selZerar).filter((k) => selZerar[k]);
    if (!grupos.length) return toast.error("Selecione o que deseja zerar.");
    setZerando(true);
    try {
      const r = await zerar({ data: { grupos, confirmacao } });
      toast.success("Dados apagados", {
        description: Object.entries(r).map(([k, v]) => `${NOMES[k] ?? "Contas de acesso"}: ${v}`).join(" • "),
        duration: 15000,
      });
      setSelZerar({}); setConfirmacao(""); recarregar();
    } catch (e: any) { toast.error(e.message); }
    finally { setZerando(false); }
  }

  if (!isAdmin) return <p className="text-muted-foreground">Apenas administradores podem acessar o debug.</p>;

  const totalPaginas = lista.data ? Math.max(1, Math.ceil(lista.data.total / lista.data.tam)) : 1;
  const c = contagens.data ?? {};

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bug className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Debug</h1>
        </div>
        <Button variant="outline" size="sm" onClick={recarregar}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
        <span>Alterações feitas aqui são definitivas. Faça um backup em Configurações → Backup antes de mexer.</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editar informações</CardTitle>
          <CardDescription>Escolha o tipo de informação, encontre o registro e edite ou apague.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={tabela} onValueChange={(v) => { setTabela(v); setPagina(0); setBusca(""); setBuscaAtiva(""); }}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BACKUP_TABELAS.map((t) => (
                  <SelectItem key={t} value={t}>{NOMES[t]} ({c[t] ?? "…"})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <form className="flex gap-2 flex-1 min-w-60" onSubmit={(e) => { e.preventDefault(); setPagina(0); setBuscaAtiva(busca); }}>
              <Input placeholder="Buscar por número, nome, e-mail ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Button type="submit" variant="secondary"><Search className="h-4 w-4" /></Button>
            </form>
          </div>

          <div className="rounded-md border divide-y">
            {lista.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando...</div>}
            {lista.error && <div className="p-4 text-sm text-destructive">{(lista.error as Error).message}</div>}
            {lista.data?.rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum registro.</div>}
            {lista.data?.rows.map((r) => (
              <div key={String(r.id)} className="flex items-center gap-2 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{resumoLinha(r)}</div>
                  <div className="truncate text-xs text-muted-foreground">{String(r.id)}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setEditando(r); setTexto(JSON.stringify(r, null, 2)); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => apagar(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{lista.data?.total ?? 0} registros</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
              <span>{pagina + 1} / {totalPaginas}</span>
              <Button size="sm" variant="outline" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Zerar dados</CardTitle>
          <CardDescription>
            Apaga tudo das partes marcadas. Sua própria conta de administrador é sempre mantida.
            Zerar secretarias também apaga os locais e responsáveis, e tira a secretaria dos protocolos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {BACKUP_GRUPOS.map((g) => {
              const n = g.tabelas.reduce((s, t) => s + (c[t] ?? 0), 0);
              return (
                <label key={g.id} className="flex gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/40">
                  <Checkbox checked={!!selZerar[g.id]} disabled={zerando}
                    onCheckedChange={(v) => setSelZerar({ ...selZerar, [g.id]: !!v })} />
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">{g.titulo}<Badge variant="secondary">{n}</Badge></div>
                    <div className="text-xs text-muted-foreground">{g.descricao}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-56" placeholder='Digite ZERAR para confirmar' value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)} />
            <Button variant="destructive" disabled={zerando || confirmacao !== "ZERAR"} onClick={executarZerar}>
              <Trash2 className="h-4 w-4 mr-2" /> {zerando ? "Apagando..." : "Zerar selecionados"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Editar — {NOMES[tabela]}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Altere os valores entre aspas e clique em Salvar. O código (id) não pode ser alterado.
          </p>
          <Textarea className="font-mono text-xs h-[60vh]" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
