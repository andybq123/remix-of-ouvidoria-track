import { termosBusca, matchProtocolo } from "@/lib/search-protocolos";
import { urlValida1doc } from "@/lib/url-1doc";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Copy, Eye, EyeOff, Download, RefreshCw, CheckCircle2, XCircle,
  Search, Inbox, Trash2, ExternalLink, Pencil, Check,
} from "lucide-react";
import { getColetorInfo } from "@/lib/coletor.functions";

export const Route = createFileRoute("/_authenticated/coletor")({
  head: () => ({ meta: [{ title: "Coletor 1doc | Seta360" }, { name: "description", content: "Coleta de protocolos do 1doc no Seta360." }, { property: "og:title", content: "Coletor 1doc | Seta360" }, { property: "og:description", content: "Coleta de protocolos do 1doc no Seta360." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ColetorPage,
});

type ProtocoloRow = {
  id: string;
  numero: string;
  assunto: string | null;
  descricao: string | null;
  status: string | null;
  solicitante: string | null;
  data_abertura: string | null;
  data_conclusao: string | null;
  secretaria_id: string | null;
  url: string | null;
  coletado_em: string | null;
  detalhes: Record<string, unknown> | null;
  secretarias?: { nome: string | null } | null;
};

function ColetorPage() {
  const fetchInfo = useServerFn(getColetorInfo);
  const { data: info, isLoading: loadingInfo, refetch: refetchInfo, isFetching: fetchingInfo, error: infoError } = useQuery({
    queryKey: ["coletor-info"],
    queryFn: () => fetchInfo(),
  });

  if (loadingInfo) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (infoError) {
    const msg = infoError instanceof Error ? infoError.message : String(infoError);
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {msg.toLowerCase().includes("forbidden")
              ? "Apenas administradores podem acessar o Coletor 1doc."
              : `Erro ao carregar: ${msg}`}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!info) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coletor 1doc</h1>
          <p className="text-sm text-muted-foreground">
            Extensão de navegador que coleta protocolos arquivados do 1doc e envia para este painel.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchInfo()} disabled={fetchingInfo}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${fetchingInfo ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat title="Total coletado" value={info.totalColetado} />
        <Stat title="Novos hoje" value={info.novosHoje} />
        <Stat title="Última execução" value={info.ultimaColeta ? new Date(info.ultimaColeta).toLocaleString("pt-BR") : "Nunca"} small />
      </div>

      <Tabs defaultValue="protocolos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="protocolos">Protocolos</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="extensao">Extensão</TabsTrigger>
        </TabsList>

        <TabsContent value="protocolos" className="space-y-4">
          <ProtocolosColetados />
        </TabsContent>

        <TabsContent value="auditoria" className="space-y-4">
          <AuditoriaUltimaColeta />
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <HistoricoColetas />
        </TabsContent>

        <TabsContent value="extensao" className="space-y-4">
          <ExtensaoSection token={info.token} backendUrl={info.backendUrl} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ title, value, small }: { title: string; value: string | number; small?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className={small ? "text-base" : "text-3xl font-semibold"}>{value}</CardContent>
    </Card>
  );
}

/* ------------------------ PROTOCOLOS ------------------------- */

function ProtocolosColetados() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [ver, setVer] = useState<ProtocoloRow | null>(null);
  const [editar, setEditar] = useState<ProtocoloRow | null>(null);
  const [excluir, setExcluir] = useState<ProtocoloRow | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarBulk, setConfirmarBulk] = useState(false);

  const { data: protocolos = [], isLoading } = useQuery({
    queryKey: ["coletor-protocolos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protocolos")
        .select("id, numero, assunto, descricao, status, solicitante, data_abertura, data_conclusao, secretaria_id, url, coletado_em, detalhes, secretarias(nome)")
        .ilike("url", "%1doc%")
        .order("data_conclusao", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as ProtocoloRow[];
    },
  });

  const excluirOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("protocolos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Protocolo excluído");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["coletor-protocolos"] });
      queryClient.invalidateQueries({ queryKey: ["coletor-info"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const excluirBulk = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("protocolos").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} protocolo${n === 1 ? "" : "s"} excluído${n === 1 ? "" : "s"}`);
      setSelecionados(new Set());
      setConfirmarBulk(false);
      queryClient.invalidateQueries({ queryKey: ["coletor-protocolos"] });
      queryClient.invalidateQueries({ queryKey: ["coletor-info"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const filtrados = useMemo(() => {
    const termos = termosBusca(busca);
    if (!termos.length) return protocolos;
    return protocolos.filter((p) => matchProtocolo(p, termos));
  }, [protocolos, busca]);

  const idsFiltrados = useMemo(() => filtrados.map((p) => p.id), [filtrados]);
  const todosMarcados = idsFiltrados.length > 0 && idsFiltrados.every((id) => selecionados.has(id));
  const algunsMarcados = idsFiltrados.some((id) => selecionados.has(id));

  function toggleTodos() {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (todosMarcados) idsFiltrados.forEach((id) => next.delete(id));
      else idsFiltrados.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleUm(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, assunto, solicitante, secretaria…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            {selecionados.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  {selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}
                </span>
                <Button variant="outline" size="sm" onClick={() => setSelecionados(new Set())}>Limpar</Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmarBulk(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir selecionados
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Inbox className="mx-auto h-10 w-10 mb-2 opacity-50" />
              {protocolos.length === 0
                ? "Nenhum protocolo coletado ainda. Use a extensão para coletar do 1doc."
                : "Nenhum resultado para esta busca."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={todosMarcados ? true : algunsMarcados ? "indeterminate" : false}
                      onCheckedChange={toggleTodos}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Secretaria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setVer(p)}
                    data-state={selecionados.has(p.id) ? "selected" : undefined}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selecionados.has(p.id)}
                        onCheckedChange={() => toggleUm(p.id)}
                        aria-label={`Selecionar ${p.numero}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{p.numero}</TableCell>
                    <TableCell className="max-w-xs truncate">{p.assunto || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{p.secretarias?.nome || "—"}</TableCell>
                    <TableCell>
                      {p.status === "concluido"
                        ? <Badge variant="secondary">concluído</Badge>
                        : <Badge variant="outline">{p.status || "—"}</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {p.data_abertura ? new Date(p.data_abertura + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => setVer(p)} title="Ver">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditar(p)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setExcluir(p)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">Protocolo {ver?.numero}</DialogTitle>
            <DialogDescription>{ver?.assunto || "Detalhes do protocolo coletado"}</DialogDescription>
          </DialogHeader>
          {ver && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <KV label="Secretaria" value={ver.secretarias?.nome} />
                <KV label="Status" value={ver.status} />
                <KV label="Solicitante" value={ver.solicitante} />
                <KV label="Abertura" value={ver.data_abertura} />
                <KV label="Conclusão" value={ver.data_conclusao} />
                <KV label="Coletado em" value={ver.coletado_em ? new Date(ver.coletado_em).toLocaleString("pt-BR") : null} />
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Descrição</div>
                <div className="rounded border bg-muted/30 p-3 whitespace-pre-wrap max-h-64 overflow-auto">
                  {ver.descricao || "—"}
                </div>
              </div>
              {ver.detalhes && Object.keys(ver.detalhes).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Detalhes coletados</div>
                  <div className="rounded border bg-muted/30 p-3 max-h-64 overflow-auto text-xs space-y-1">
                    {Object.entries(ver.detalhes).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[160px_1fr] gap-2">
                        <span className="font-medium text-muted-foreground">{k}</span>
                        <span className="whitespace-pre-wrap break-words">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {urlValida1doc(ver.url) && (
                <a href={urlValida1doc(ver.url)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                  Abrir no 1doc <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setEditar(ver); setVer(null); }}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setExcluir(ver); setVer(null); }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editar && (
        <EditarDialog
          protocolo={editar}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            queryClient.invalidateQueries({ queryKey: ["coletor-protocolos"] });
          }}
        />
      )}

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir protocolo {excluir?.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro será removido do painel. Se continuar arquivado no 1doc, poderá ser recoletado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluir && excluirOne.mutate(excluir.id)}
              disabled={excluirOne.isPending}
            >
              {excluirOne.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarBulk} onOpenChange={setConfirmarBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selecionados.size} protocolo{selecionados.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>Esta ação remove os registros selecionados do painel.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluirBulk.mutate(Array.from(selecionados))}
              disabled={excluirBulk.isPending}
            >
              {excluirBulk.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditarDialog({
  protocolo, onClose, onSaved,
}: { protocolo: ProtocoloRow; onClose: () => void; onSaved: () => void }) {
  const [assunto, setAssunto] = useState(protocolo.assunto || "");
  const [descricao, setDescricao] = useState(protocolo.descricao || "");
  const [solicitante, setSolicitante] = useState(protocolo.solicitante || "");
  const [status, setStatus] = useState(protocolo.status || "");

  const { data: secretarias = [] } = useQuery({
    queryKey: ["coletor-secretarias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("secretarias").select("id, nome").order("nome");
      if (error) throw error;
      return data || [];
    },
  });
  const [secretariaId, setSecretariaId] = useState<string>(protocolo.secretaria_id || "");

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("protocolos").update({
        assunto: (assunto || "Ouvidoria").slice(0, 500),
        descricao: descricao || null,
        solicitante: solicitante || null,
        secretaria_id: secretariaId || null,
        ...(status ? { status: status as "aberto" | "em_andamento" | "concluido" } : {}),
      }).eq("id", protocolo.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Protocolo atualizado"); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">Editar {protocolo.numero}</DialogTitle>
          <DialogDescription>Ajuste os dados do protocolo coletado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Labeled label="Assunto">
            <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Solicitante">
              <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
            </Labeled>
            <Labeled label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">—</option>
                <option value="aberto">aberto</option>
                <option value="em_andamento">em_andamento</option>
                <option value="concluido">concluido</option>
              </select>
            </Labeled>
          </div>
          <Labeled label="Secretaria">
            <select
              value={secretariaId}
              onChange={(e) => setSecretariaId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— (sem secretaria)</option>
              {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Labeled>
          <Labeled label="Descrição">
            <Textarea rows={6} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Labeled>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            <Check className="mr-2 h-4 w-4" />
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}

/* ------------------------ HISTÓRICO ------------------------- */

type IgnoradoItem = { numero: string; motivo: string; url?: string | null };
type ColetaRow = {
  id: string;
  executado_em: string;
  total: number;
  novos: number;
  atualizados: number | null;
  ja_concluidos: number | null;
  sem_correspondencia: number | null;
  ignorados_detalhes: IgnoradoItem[] | null;
  sucesso: boolean;
  erro: string | null;
  duracao_ms: number | null;
};

const MOTIVO_LABEL: Record<string, string> = {
  sem_correspondencia: "Não existe no sistema",
  ja_concluido: "Já estava concluído",
};

function AuditoriaUltimaColeta() {
  const { data: ultima, isLoading } = useQuery({
    queryKey: ["coletor-auditoria-ultima"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coletas")
        .select("id, executado_em, total, novos, atualizados, ja_concluidos, sem_correspondencia, ignorados_detalhes, sucesso, erro, duracao_ms")
        .order("executado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ColetaRow | null;
    },
  });

  if (isLoading) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!ultima) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma execução do coletor ainda.
        </CardContent>
      </Card>
    );
  }

  const total = ultima.total ?? 0;
  const atualizados = ultima.atualizados ?? ultima.novos ?? 0;
  const jaConcluidos = ultima.ja_concluidos ?? 0;
  const semCorr = ultima.sem_correspondencia ?? 0;
  const ignorados = (ultima.ignorados_detalhes ?? []) as IgnoradoItem[];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Última execução</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(ultima.executado_em).toLocaleString("pt-BR")}
              {ultima.duracao_ms != null && <> · {(ultima.duracao_ms / 1000).toFixed(1)}s</>}
            </p>
          </div>
          {ultima.sucesso ? (
            <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" /> sucesso</Badge>
          ) : (
            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> falha</Badge>
          )}
        </CardHeader>
        <CardContent className="pt-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat title="Encontrados" value={total} />
            <Stat title="Concluídos agora" value={atualizados} />
            <Stat title="Já concluídos" value={jaConcluidos} />
            <Stat title="Sem correspondência" value={semCorr} />
          </div>
          {ultima.erro && (
            <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {ultima.erro}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ignorados ({ignorados.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Protocolos recebidos do 1doc que não foram aplicados, com o motivo.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {ignorados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum protocolo ignorado nesta execução.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>1doc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ignorados.map((it, i) => (
                  <TableRow key={`${it.numero}-${i}`}>
                    <TableCell className="font-medium">{it.numero}</TableCell>
                    <TableCell>
                      <Badge variant={it.motivo === "sem_correspondencia" ? "outline" : "secondary"}>
                        {MOTIVO_LABEL[it.motivo] ?? it.motivo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {it.url ? (
                        <a href={it.url} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoricoColetas() {
  const { data: coletas = [], isLoading } = useQuery({
    queryKey: ["coletor-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coletas").select("*")
        .order("executado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : coletas.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma execução registrada.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Novos</TableHead>
                <TableHead className="text-right">Duração</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coletas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">{new Date(c.executado_em).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant={(c as any).origem === "worker" ? "default" : "outline"} className="text-[10px]">
                      {(c as any).origem === "worker" ? "worker" : "extensão"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{c.total}</TableCell>
                  <TableCell className="text-right font-medium">{c.novos}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {c.duracao_ms != null ? `${(c.duracao_ms / 1000).toFixed(1)}s` : "—"}
                  </TableCell>
                  <TableCell>
                    {c.sucesso
                      ? <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" /> sucesso</Badge>
                      : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> falha</Badge>}
                  </TableCell>
                  <TableCell className="max-w-[420px] truncate text-xs text-muted-foreground" title={c.erro ?? ""}>
                    {c.erro ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------ EXTENSÃO ------------------------- */

function ExtensaoSection({ token, backendUrl }: { token: string; backendUrl: string }) {
  const [revelar, setRevelar] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : backendUrl;

  function copy(value: string, setter: (b: boolean) => void) {
    navigator.clipboard.writeText(value).then(() => {
      setter(true);
      toast.success("Copiado");
      setTimeout(() => setter(false), 1500);
    });
  }

  async function baixarZip() {
    try {
      if (!token) {
        toast.error("Token ainda não carregou, tente novamente em alguns segundos.");
        return;
      }
      const res = await fetch("/coletor-1doc.zip");
      if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const files = unzipSync(buf);
      files["defaults.json"] = strToU8(JSON.stringify({ backend: origin, token }, null, 2));
      const out = zipSync(files);
      const blob = new Blob([out as BlobPart], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "coletor-1doc.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Extensão baixada já configurada com URL e token.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Baixe a extensão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={baixarZip}>
            <Download className="mr-2 h-4 w-4" /> Baixar extensão (.zip)
          </Button>
          <ol className="text-sm space-y-1 list-decimal pl-5 text-muted-foreground">
            <li>Descompacte o arquivo baixado.</li>
            <li>Abra <code className="text-foreground">chrome://extensions</code> no Chrome / Edge / Brave.</li>
            <li>Ative o <strong className="text-foreground">Modo do desenvolvedor</strong> (canto superior direito).</li>
            <li>Clique em <strong className="text-foreground">Carregar sem compactação</strong> e escolha a pasta descompactada.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            O ZIP já vem pré-configurado com a URL deste painel e o seu token — não precisa colar nada na extensão.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Use no 1doc</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <ol className="list-decimal pl-5 space-y-1">
            <li>Faça login no 1doc normalmente.</li>
            <li>Abra <strong className="text-foreground">Ouvidoria → Finalizados</strong> (ou outra listagem).</li>
            <li>Clique no ícone da extensão e em <strong className="text-foreground">Coletar da aba atual</strong>.</li>
            <li>Os protocolos aparecem na aba <strong className="text-foreground">Protocolos</strong> deste painel.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciais (uso manual)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">URL do backend</label>
            <div className="flex gap-2">
              <Input readOnly value={origin} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(origin, setCopiedUrl)}>
                {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Token (INGEST_TOKEN)</label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={revelar ? token : (token ? `${token.slice(0, 6)}${"•".repeat(20)}` : "(não configurado)")}
                className="font-mono text-xs"
              />
              <Button variant="ghost" size="icon" onClick={() => setRevelar((v) => !v)} title={revelar ? "Ocultar" : "Mostrar"}>
                {revelar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => copy(token, setCopiedToken)}>
                {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Mantenha o token em segredo.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}