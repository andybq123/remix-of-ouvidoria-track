import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, KeyRound, ArrowUp, ArrowDown, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getAiConfig, saveAiProvider, saveAiPriority, testAiProvider } from "@/lib/ai-config.functions";

export const Route = createFileRoute("/_authenticated/ia-config")({
  head: () => ({
    meta: [
      { title: "Configuração de IA — Controle SETA" },
      { name: "description", content: "Configure as IAs Groq e Google Gemini individualmente e a ordem de uso." },
      { property: "og:title", content: "Configuração de IA — Controle SETA" },
      { property: "og:description", content: "Configure as IAs Groq e Google Gemini individualmente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IAConfigPage,
});

type Prov = "grok" | "gemini";
const LABELS: Record<Prov, string> = { grok: "Groq", gemini: "Google Gemini" };
const DEFAULTS: Record<Prov, string> = { grok: "llama-3.3-70b-versatile", gemini: "gemini-2.5-flash" };
const KEY_HELP: Record<Prov, { url: string; placeholder: string }> = {
  grok: { url: "https://console.groq.com/keys", placeholder: "gsk_..." },
  gemini: { url: "https://aistudio.google.com/apikey", placeholder: "AIza..." },
};
const MODELS: Record<Prov, { value: string; label: string }[]> = {
  grok: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (recomendado)" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (mais rápido)" },
    { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
    { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
    { value: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
    { value: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick 17B" },
  ],
  gemini: [
    { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
    { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (recomendado)" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
};

function IAConfigPage() {
  const qc = useQueryClient();
  const getCfg = useServerFn(getAiConfig);
  const savePrio = useServerFn(saveAiPriority);
  const { data, isLoading } = useQuery({ queryKey: ["ai-config"], queryFn: () => getCfg({}) });
  const [priority, setPriority] = useState<Prov[]>(["grok", "gemini"]);
  useEffect(() => { if (data) setPriority(data.priority as Prov[]); }, [data]);

  const mPrio = useMutation({
    mutationFn: (p: Prov[]) => savePrio({ data: { priority: p } }),
    onSuccess: () => { toast.success("Ordem salva"); qc.invalidateQueries({ queryKey: ["ai-config"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const swap = () => { const n = [...priority].reverse() as Prov[]; setPriority(n); mPrio.mutate(n); };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Configuração de IA
        </h1>
        <p className="text-sm text-muted-foreground">
          O sistema usa somente Groq e Google Gemini. Cada uma é configurada e testada separadamente.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Ordem de uso</CardTitle>
              <CardDescription>A primeira é a principal; se falhar, o sistema usa a segunda automaticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {priority.map((p, i) => (
                <div key={p} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">{i + 1}</span>
                    <span className="font-medium">{LABELS[p]}</span>
                    <span className="text-xs text-muted-foreground">{i === 0 ? "principal" : "reserva"}</span>
                  </div>
                  <Button variant="outline" size="icon" onClick={swap} disabled={mPrio.isPending} aria-label="Inverter ordem">
                    {i === 0 ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {(["grok", "gemini"] as Prov[]).map((p) => (
            <ProviderCard key={p} provider={p} info={data[p]} />
          ))}
        </>
      )}
    </div>
  );
}

function ProviderCard({ provider, info }: { provider: Prov; info: { hasKey: boolean; apiKeyMasked: string | null; model: string } }) {
  const qc = useQueryClient();
  const save = useServerFn(saveAiProvider);
  const test = useServerFn(testAiProvider);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(info.model);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => setModel(info.model), [info.model]);

  const mSave = useMutation({
    mutationFn: (clearKey?: boolean) =>
      save({ data: { provider, apiKey: key || undefined, model: model || undefined, clearKey, validate: !!key } }),
    onSuccess: (r: any, clearKey) => {
      toast.success(clearKey ? "Chave removida" : `${LABELS[provider]} salvo${r?.reply ? " e validado" : ""}`);
      if (r?.reply) setStatus({ ok: true, msg: `Chave válida — ${r.reply}` });
      setKey("");
      qc.invalidateQueries({ queryKey: ["ai-config"] });
    },
    onError: (e: any) => {
      setStatus({ ok: false, msg: e?.message ?? "Erro" });
      toast.error(`Não salvo: ${e?.message ?? "erro"}`);
    },
  });

  const mTest = useMutation({
    mutationFn: () => test({ data: { provider } }),
    onSuccess: (r: any) => setStatus({ ok: true, msg: `Funcionando — modelo ${r.model} respondeu "${r.reply}"` }),
    onError: (e: any) => setStatus({ ok: false, msg: e?.message ?? "Falha no teste" }),
  });

  const sel = MODELS[provider].some((o) => o.value === model) ? model : model ? "__custom__" : "__default__";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> {LABELS[provider]}
          {info.hasKey ? <Badge variant="secondary">Chave cadastrada {info.apiKeyMasked}</Badge> : <Badge variant="outline">Sem chave</Badge>}
        </CardTitle>
        <CardDescription>
          Pegue a chave em{" "}
          <a className="underline" href={KEY_HELP[provider].url} target="_blank" rel="noreferrer">{KEY_HELP[provider].url.replace("https://", "")}</a>.
          Ao salvar uma chave nova, ela é testada antes de ser gravada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nova API key</Label>
          <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={info.hasKey ? "Deixe vazio para manter a atual" : KEY_HELP[provider].placeholder} />
        </div>
        <div className="space-y-1.5">
          <Label>Modelo</Label>
          <Select value={sel} onValueChange={(v) => setModel(v === "__default__" ? "" : v === "__custom__" ? model : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Padrão ({DEFAULTS[provider]})</SelectItem>
              {MODELS[provider].map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              {sel === "__custom__" && <SelectItem value="__custom__">Personalizado: {model}</SelectItem>}
            </SelectContent>
          </Select>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={`Ou digite outro modelo (padrão ${DEFAULTS[provider]})`} />
        </div>
        {status && (
          <div className={`flex items-start gap-2 rounded-md border p-2 text-sm ${status.ok ? "border-primary/40" : "border-destructive/50 text-destructive"}`}>
            {status.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
            <span className="break-all">{status.msg}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => mSave.mutate(false)} disabled={mSave.isPending}>{mSave.isPending ? "Validando…" : "Salvar"}</Button>
          <Button variant="outline" onClick={() => mTest.mutate()} disabled={!info.hasKey || mTest.isPending}>{mTest.isPending ? "Testando…" : "Testar"}</Button>
          {info.hasKey && (
            <Button variant="ghost" onClick={() => confirm(`Remover a chave do ${LABELS[provider]}?`) && mSave.mutate(true)}>Remover chave</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
