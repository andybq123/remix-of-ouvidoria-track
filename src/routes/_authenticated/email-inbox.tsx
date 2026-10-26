import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Plus, Trash2, AlertCircle, CheckCircle2, Clock, RefreshCw, ShieldCheck, Sparkles, Bot, Zap } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { sincronizarGmail, ressincronizarGmail, reverificarEmails, backfillUrls1Doc, reprocessarEmail, testarContaImap } from "@/lib/gmail-sync.functions";
import { EsicMailboxButton } from "@/components/esic-mailbox-button";

const SYNC_INTERVAL_MIN = 3;

function useTick(ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN(n => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function formatDelta(ms: number): string {
  if (ms <= 0) return "a qualquer momento";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  if (m <= 0) return `em ${ss}s`;
  return `em ${m}m ${ss.toString().padStart(2, "0")}s`;
}

export const Route = createFileRoute("/_authenticated/email-inbox")({
  head: () => ({ meta: [
    { title: "E-mails | OuviDesk" },
    { name: "description", content: "E-mails no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "E-mails | OuviDesk" },
    { property: "og:description", content: "E-mails no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: EmailInboxPage,
});

function EmailInboxPage() {
  const qc = useQueryClient();
  const sincronizar = useServerFn(sincronizarGmail);
  const ressincronizar = useServerFn(ressincronizarGmail);
  const reverificar = useServerFn(reverificarEmails);
  const backfillUrls = useServerFn(backfillUrls1Doc);
  const reprocessar = useServerFn(reprocessarEmail);
  const [reprocessandoId, setReprocessandoId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [ressincronizando, setRessincronizando] = useState(false);
  const [reverificando, setReverificando] = useState(false);
  const [backfillando, setBackfillando] = useState(false);
  useTick(1000);

  async function rodarSync() {
    setSincronizando(true);
    try {
      const r = await sincronizar({}) as any;
      toast.success(`Sincronização: ${r?.novos ?? 0} novo(s), ${r?.erros ?? 0} erro(s) em ${r?.contas ?? 0} conta(s)`);
      qc.invalidateQueries({ queryKey: ["email-inbox-accounts"] });
      qc.invalidateQueries({ queryKey: ["email-inbox-log"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao sincronizar");
    } finally {
      setSincronizando(false);
    }
  }

  async function rodarRessync() {
    if (!confirm("Ressincronizar os últimos 30 dias de e-mails? E-mails já processados não serão duplicados.")) return;
    setRessincronizando(true);
    try {
      const r = await ressincronizar({ data: { dias: 30 } }) as any;
      toast.success(`Ressincronização: ${r?.novos ?? 0} novo(s), ${r?.erros ?? 0} erro(s) em ${r?.contas ?? 0} conta(s)`);
      qc.invalidateQueries({ queryKey: ["email-inbox-accounts"] });
      qc.invalidateQueries({ queryKey: ["email-inbox-log"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ressincronizar");
    } finally {
      setRessincronizando(false);
    }
  }

  async function rodarReverificacao() {
    if (!confirm("Reverificar os últimos 60 dias e tentar criar protocolo para todos os e-mails que ainda não foram protocolizados? Pode demorar alguns minutos.")) return;
    setReverificando(true);
    try {
      const r = await reverificar({ data: { dias: 60 } }) as any;
      toast.success(`Reverificação: ${r?.reprocessados ?? 0} reprocessado(s), ${r?.novos ?? 0} novo(s) protocolo(s), ${r?.erros ?? 0} erro(s)`);
      qc.invalidateQueries({ queryKey: ["email-inbox-accounts"] });
      qc.invalidateQueries({ queryKey: ["email-inbox-log"] });
      qc.invalidateQueries({ queryKey: ["protocolos"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reverificar");
    } finally {
      setReverificando(false);
    }
  }

  async function rodarBackfillUrls() {
    if (!confirm(
      "Buscar nos últimos 180 dias do Gmail e preencher a URL do 1Doc nos protocolos existentes que ainda estão sem link?\n\n" +
      "Não cria protocolos novos, não altera status nem nenhum outro campo — só preenche a URL quando estiver vazia."
    )) return;
    setBackfillando(true);
    try {
      const r = await backfillUrls({ data: { dias: 180 } }) as any;
      toast.success(
        `Backfill: ${r?.atualizados ?? 0} protocolo(s) atualizado(s). ` +
        `Lidos ${r?.emails_lidos ?? 0} e-mails · ${r?.ja_com_url ?? 0} já tinham URL · ` +
        `${r?.sem_link ?? 0} sem link · ${r?.sem_numero ?? 0} sem nº · ${r?.sem_protocolo ?? 0} sem protocolo.`
      );
      qc.invalidateQueries({ queryKey: ["protocolos"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no backfill de URLs");
    } finally {
      setBackfillando(false);
    }
  }

  const { data: accounts = [] } = useQuery({
    queryKey: ["email-inbox-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_inbox_accounts")
        .select("*, secretarias(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["email-inbox-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_inbox_log")
        .select("*, email_inbox_accounts(email), protocolos(id, numero, assunto)")
        .order("recebido_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("*").order("nome")).data ?? [],
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("email_inbox_accounts").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-inbox-accounts"] }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_inbox_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-inbox-accounts"] }); toast.success("Conta removida"); },
  });

  const statusBadge = (s: string) => {
    if (s === "processado") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30" variant="outline"><CheckCircle2 className="h-3 w-3 mr-1" />Processado</Badge>;
    if (s === "erro") return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Erro</Badge>;
    if (s === "ignorado") return <Badge variant="secondary">Ignorado</Badge>;
    return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
  };

  const aiBadge = (p: string | null | undefined) => {
    if (!p) return null;
    if (p === "gemini")
      return (
        <Badge
          variant="outline"
          className="bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300"
          title="Processado pela IA Gemini (Google)"
        >
          <Sparkles className="h-3 w-3 mr-1" /> Gemini
        </Badge>
      );
    if (p === "grok" || p === "groq")
      return (
        <Badge
          variant="outline"
          className="bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300"
          title="Processado pela IA Groq (Llama)"
        >
          <Zap className="h-3 w-3 mr-1" /> Groq
        </Badge>
      );
    return (
      <Badge
        variant="outline"
        className="bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-300"
        title="Processado pela IA integrada"
      >
        <Bot className="h-3 w-3 mr-1" /> IA
      </Badge>
    );
  };

  async function rodarReprocessar(logId: string) {
    setReprocessandoId(logId);
    try {
      const r = await reprocessar({ data: { logId } }) as any;
      if (r?.ok) {
        toast.success(`Reprocessado: protocolo ${r.numero ?? ""} criado`);
      } else {
        toast.error(r?.error ?? "Falha ao reprocessar");
      }
      qc.invalidateQueries({ queryKey: ["email-inbox-log"] });
      qc.invalidateQueries({ queryKey: ["protocolos"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reprocessar");
    } finally {
      setReprocessandoId(null);
    }
  }

  const syncAccounts = accounts.filter((a: any) => (a.provider === "gmail" || a.provider === "imap") && a.ativo);
  const ultimaSync = syncAccounts
    .map((a: any) => a.ultima_sincronizacao ? new Date(a.ultima_sincronizacao).getTime() : 0)
    .reduce((max, t) => Math.max(max, t), 0);
  const proximaSync = ultimaSync ? ultimaSync + SYNC_INTERVAL_MIN * 60_000 : 0;
  const agora = Date.now();
  const totalNovos = syncAccounts.reduce((s: number, a: any) => s + (a.ultima_sync_novos ?? 0), 0);
  const totalErros = syncAccounts.reduce((s: number, a: any) => s + (a.ultima_sync_erros ?? 0), 0);
  const totalProc = syncAccounts.reduce((s: number, a: any) => s + (a.ultima_sync_processados ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Mail className="h-6 w-6" /> Recepção por E-mail</h1>
          <p className="text-sm text-muted-foreground">Encaminhe e-mails para um endereço único e o sistema cria a ouvidoria automaticamente.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <EsicMailboxButton accountIds={syncAccounts.map(a => a.id)} disabled={sincronizando || ressincronizando || reverificando || backfillando} />
          <Button variant="outline" onClick={rodarBackfillUrls} disabled={backfillando || reverificando || ressincronizando || sincronizando} title="Preenche a URL do 1Doc nos protocolos existentes sem link">
            <RefreshCw className={`h-4 w-4 mr-1 ${backfillando ? "animate-spin" : ""}`} />
            Backfill URLs 1Doc
          </Button>
          <Button variant="outline" onClick={rodarReverificacao} disabled={reverificando || ressincronizando || sincronizando} title="Reverifica e-mails não protocolizados nos últimos 60 dias">
            <ShieldCheck className={`h-4 w-4 mr-1 ${reverificando ? "animate-spin" : ""}`} />
            Reverificar não-protocolados
          </Button>
          <Button variant="outline" onClick={rodarRessync} disabled={ressincronizando || sincronizando}>
            <RefreshCw className={`h-4 w-4 mr-1 ${ressincronizando ? "animate-spin" : ""}`} />
            Ressincronizar 30 dias
          </Button>
          <Button variant="outline" onClick={rodarSync} disabled={sincronizando}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sincronizando ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
          <NovaContaDialog secretarias={secretarias} />
        </div>
      </div>

      {syncAccounts.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Próxima sincronização</p>
                <p className="text-sm font-semibold flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                  {proximaSync
                    ? `${formatDelta(proximaSync - agora)} (${format(new Date(proximaSync), "HH:mm:ss")})`
                    : "aguardando 1ª execução"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Intervalo automático: a cada {SYNC_INTERVAL_MIN} min</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Última execução</p>
                <p className="text-sm font-semibold mt-0.5">
                  {ultimaSync ? format(new Date(ultimaSync), "dd/MM HH:mm:ss") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">E-mails processados (última)</p>
                <p className="text-sm font-semibold mt-0.5">
                  {totalProc} <span className="text-xs text-muted-foreground">(novos: {totalNovos}, erros: {totalErros})</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contas ativas</p>
                <p className="text-sm font-semibold mt-0.5">{syncAccounts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas">Contas ({accounts.length})</TabsTrigger>
          <TabsTrigger value="log">Histórico ({logs.length})</TabsTrigger>
          <TabsTrigger value="como">Como funciona</TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="space-y-3">
          {accounts.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma conta cadastrada ainda.</CardContent></Card>
          )}
          {accounts.map(a => {
            return (
              <Card key={a.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{a.email}</span>
                        <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30" variant="outline">Gmail</Badge>
                        {!a.ativo && <Badge variant="secondary">Inativa</Badge>}
                      </div>
                      {a.descricao && <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>}
                      {(a as any).secretarias && <p className="text-xs text-muted-foreground mt-0.5">Vinculada à secretaria: <strong>{(a as any).secretarias.nome}</strong></p>}
                      {(a as any).ultima_sincronizacao && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Última sincronização: {format(new Date((a as any).ultima_sincronizacao), "dd/MM/yyyy HH:mm:ss")}
                          {" · "}processados: {(a as any).ultima_sync_processados ?? 0}
                          {" · "}novos: {(a as any).ultima_sync_novos ?? 0}
                          {" · "}erros: {(a as any).ultima_sync_erros ?? 0}
                        </p>
                      )}
                      {(a as any).ultima_sync_erro_detalhe && (
                        <p className="text-xs text-destructive mt-1">Último erro: {(a as any).ultima_sync_erro_detalhe}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span>Ativa</span>
                        <Switch checked={a.ativo} onCheckedChange={(v) => toggleAtivo.mutate({ id: a.id, ativo: v })} />
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover conta?")) remover.mutate(a.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2 text-xs text-muted-foreground">
                    ✓ Conectado ao Google. O sistema verifica a caixa a cada {SYNC_INTERVAL_MIN} min e cria protocolos automaticamente.
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="log" className="space-y-2">
          {logs.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum e-mail recebido ainda.</CardContent></Card>
          )}
          {logs.map((l: any) => (
            <Card key={l.id}>
              <CardContent className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(l.status)}
                      {aiBadge(l.ai_provider)}
                      <span className="text-xs text-muted-foreground">{format(new Date(l.recebido_em), "dd/MM/yyyy HH:mm")}</span>
                      {l.email_inbox_accounts?.email && <span className="text-xs text-muted-foreground">→ {l.email_inbox_accounts.email}</span>}
                    </div>
                    <p className="text-sm font-medium mt-1 truncate">{l.assunto || "(sem assunto)"}</p>
                    <p className="text-xs text-muted-foreground truncate">De: {l.remetente || "—"}</p>
                    {l.erro && <p className="text-xs text-destructive mt-1">⚠ {l.erro}</p>}
                    {l.protocolos && (
                      <p className="text-xs mt-1">
                        Protocolo criado: <strong>{l.protocolos.numero}</strong> — {l.protocolos.assunto}
                      </p>
                    )}
                  </div>
                  {l.status === "erro" && !l.protocolo_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rodarReprocessar(l.id)}
                      disabled={reprocessandoId === l.id}
                      title="Tentar processar este e-mail novamente"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${reprocessandoId === l.id ? "animate-spin" : ""}`} />
                      Reprocessar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="como">
          <Card>
            <CardHeader>
              <CardTitle>Como funciona</CardTitle>
              <CardDescription>O sistema lê a caixa do Gmail com uma senha de app e cria os protocolos automaticamente a cada 3 minutos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold mb-1">1. Cadastre a conta</h3>
                <p className="text-muted-foreground">Na conta Google, ative a <strong>verificação em 2 etapas</strong> e crie uma <strong>senha de app</strong> em myaccount.google.com/apppasswords. Depois, na aba "Contas", clique em <strong>Nova conta</strong>, informe o e-mail e a senha de app, teste e cadastre.</p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">2. Sincronização automática</h3>
                <p className="text-muted-foreground">A cada {SYNC_INTERVAL_MIN} minutos o sistema lê os novos e-mails da caixa Gmail conectada e cria protocolos automaticamente. Você também pode clicar em <strong>Sincronizar agora</strong> a qualquer momento.</p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">3. Teste</h3>
                <p className="text-muted-foreground">Envie um e-mail para a conta cadastrada. Em poucos minutos ele aparece na aba <strong>Histórico</strong> e o protocolo é criado em <strong>Protocolos</strong>.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NovaContaDialog({ secretarias }: { secretarias: any[] }) {
  const qc = useQueryClient();
  const testar = useServerFn(testarContaImap);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [descricao, setDescricao] = useState("");
  const [secId, setSecId] = useState<string>("");
  const [teste, setTeste] = useState<{ ok: boolean; msg: string } | null>(null);

  const mTeste = useMutation({
    mutationFn: () => testar({ data: { user: email.trim(), pass: senha } }),
    onSuccess: (r: any) => setTeste({ ok: true, msg: `Conectado! ${r.mensagens} e-mail(s) na caixa de entrada.` }),
    onError: (e: any) => setTeste({ ok: false, msg: e?.message ?? "Falha" }),
  });

  const criar = useMutation({
    mutationFn: async () => {
      await testar({ data: { user: email.trim(), pass: senha } });
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        email: email.trim().toLowerCase(),
        descricao: descricao || null,
        secretaria_id: secId || null,
        created_by: user?.id,
        provider: "imap",
        imap_host: "imap.gmail.com",
        imap_port: 993,
        imap_tls: true,
        imap_user: email.trim(),
        imap_password: senha.replace(/\s+/g, ""),
        ativo: true,
      };
      // Se o e-mail já existe (ex.: conta antiga ligada pela nuvem), converte para senha de app.
      const { data: existente } = await supabase
        .from("email_inbox_accounts").select("id").eq("email", payload.email).maybeSingle();
      if (existente?.id) {
        const { created_by: _cb, ...upd } = payload;
        const { error } = await supabase.from("email_inbox_accounts").update(upd).eq("id", existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_inbox_accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-inbox-accounts"] });
      toast.success("Conta Gmail cadastrada — coleta automática a cada 3 minutos");
      setOpen(false);
      setEmail(""); setSenha(""); setDescricao(""); setSecId(""); setTeste(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova conta</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Configurar conta Gmail</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
            <p><strong>1.</strong> Na conta Google, ative a verificação em 2 etapas.</p>
            <p><strong>2.</strong> Crie uma senha de app em{" "}
              <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a> (16 letras).</p>
            <p><strong>3.</strong> Cole abaixo, clique em Testar e depois em Cadastrar. A leitura é automática a cada 3 minutos.</p>
          </div>
          <div className="space-y-1.5">
            <Label>E-mail Gmail *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="setamonitoramento75@gmail.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Senha de app *</Label>
            <Input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="abcd efgh ijkl mnop" />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Caixa principal da Ouvidoria" />
          </div>
          <div className="space-y-1.5">
            <Label>Vincular à secretaria (opcional)</Label>
            <Select value={secId} onValueChange={setSecId}>
              <SelectTrigger><SelectValue placeholder="Detectar automaticamente" /></SelectTrigger>
              <SelectContent>
                {secretarias.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {teste && (
            <div className={`flex items-start gap-2 rounded-md border p-2 text-sm ${teste.ok ? "border-primary/40" : "border-destructive/50 text-destructive"}`}>
              {teste.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
              <span>{teste.msg}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="outline" onClick={() => mTeste.mutate()} disabled={!email || !senha || mTeste.isPending}>{mTeste.isPending ? "Testando…" : "Testar conexão"}</Button>
          <Button onClick={() => criar.mutate()} disabled={!email || !senha || criar.isPending}>{criar.isPending ? "Validando…" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
