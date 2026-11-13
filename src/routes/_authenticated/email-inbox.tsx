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
import { Mail, Plus, Trash2, AlertCircle, CheckCircle2, Clock, RefreshCw, Sparkles, Bot, Zap } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { sincronizarGmail, testarContaImap, salvarContaImap } from "@/lib/gmail-sync.functions";
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
  const [sincronizando, setSincronizando] = useState(false);
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

  const { data: accounts = [] } = useQuery({
    queryKey: ["email-inbox-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_inbox_accounts")
        .select("id,email,descricao,ativo,provider,imap_host,imap_port,imap_user,imap_tls,created_at,ultima_sincronizacao,ultima_sync_novos,ultima_sync_erros,ultima_sync_processados,ultima_sync_erro_detalhe,secretarias(nome)")
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
          <EsicMailboxButton accountIds={syncAccounts.map(a => a.id)} disabled={sincronizando} />
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
                        <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30" variant="outline">{a.provider === "imap" ? "IMAP seguro" : a.provider}</Badge>
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
                    {a.imap_host ? `${a.imap_host}:${a.imap_port} · ${a.imap_user}` : "Conta de e-mail"}
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
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="como">
          <Card>
            <CardHeader>
              <CardTitle>Como funciona</CardTitle>
              <CardDescription>Contas institucionais conectadas por IMAP com TLS.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold mb-1">1. Cadastre a conta</h3>
                <p className="text-muted-foreground">Solicite à TI o servidor IMAP, a porta segura e o usuário da conta institucional. Use a senha específica de aplicativo se exigida pelo provedor.</p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">2. Sincronização automática</h3>
                <p className="text-muted-foreground">A cada {SYNC_INTERVAL_MIN} minutos o sistema lê os novos e-mails da caixa de e-mail conectada e cria protocolos automaticamente. Você também pode clicar em <strong>Sincronizar agora</strong> a qualquer momento.</p>
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
  const salvar = useServerFn(salvarContaImap);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [usuario, setUsuario] = useState("");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [descricao, setDescricao] = useState("");
  const [secId, setSecId] = useState<string>("");
  const [teste, setTeste] = useState<{ ok: boolean; msg: string } | null>(null);

  const mTeste = useMutation({
    mutationFn: () => testar({ data: { host, port: Number(port), user: usuario || email, pass: senha } }),
    onSuccess: (r: any) => setTeste({ ok: true, msg: `Conectado! ${r.mensagens} e-mail(s) na caixa de entrada.` }),
    onError: (e: any) => setTeste({ ok: false, msg: e?.message ?? "Falha" }),
  });

  const criar = useMutation({
    mutationFn: () => salvar({ data: { email, host, port: Number(port), user: usuario || email,
      pass: senha, descricao, secretariaId: secId || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-inbox-accounts"] });
      toast.success("Conta IMAP cadastrada com segurança");
      setOpen(false);
      setEmail(""); setSenha(""); setHost(""); setPort("993"); setUsuario(""); setDescricao(""); setSecId(""); setTeste(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setSenha(""); setTeste(null); } }}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova conta</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Configurar conta institucional</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Porta 993: SSL/TLS. Porta 143: STARTTLS obrigatório. Certificado válido e senha protegida.</p>
          <div className="space-y-1.5">
            <Label htmlFor="imap-email">E-mail institucional *</Label>
            <Input id="imap-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setTeste(null); }} placeholder="ouvidoria@instituicao.gov.br" />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="imap-host">Servidor IMAP *</Label>
              <Input id="imap-host" value={host} onChange={e => { setHost(e.target.value); setTeste(null); }} placeholder="mail.instituicao.gov.br" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imap-port">Porta *</Label>
              <Input id="imap-port" type="number" min={1} max={65535} value={port} onChange={e => { setPort(e.target.value); setTeste(null); }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imap-user">Usuário IMAP</Label>
            <Input id="imap-user" autoComplete="off" value={usuario} onChange={e => { setUsuario(e.target.value); setTeste(null); }} placeholder="Mesmo e-mail, se não informado" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imap-password">Senha *</Label>
            <Input id="imap-password" type="password" autoComplete="new-password" value={senha} onChange={e => { setSenha(e.target.value); setTeste(null); }} />
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
          <Button variant="outline" onClick={() => { setOpen(false); setSenha(""); setTeste(null); }}>Cancelar</Button>
          <Button variant="outline" onClick={() => mTeste.mutate()} disabled={!email || !host || !senha || criar.isPending || mTeste.isPending}>{mTeste.isPending ? "Testando…" : "Testar conexão"}</Button>
          <Button onClick={() => criar.mutate()} disabled={!email || !host || !senha || mTeste.isPending || criar.isPending}>{criar.isPending ? "Validando…" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
