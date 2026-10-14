import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MapPointPicker } from "@/components/map-point-picker";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { CATEGORIAS, gerarNumeroProtocolo, type CategoriaPersistidaProtocolo } from "@/lib/prazo";
import { ASSUNTOS_OUVIDORIA } from "@/lib/assuntos-ouvidoria";
import { MapPin, CheckCircle2, ShieldAlert, Eye, EyeOff, UserX, Send, Copy, Download, Printer, Search, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import brusqueBrasao from "@/assets/brusque-brasao.png";
import { gerarHashConsulta, gerarProtocoloPdf, type ProtocoloPdfData } from "@/lib/protocolo-pdf";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/ouvidoria")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Ouvidoria — Registre sua manifestação" },
      { name: "description", content: "Canal de ouvidoria do município. Registre denúncias, reclamações, elogios, sugestões e pedidos de informação — de forma pública, sigilosa ou anônima." },
      { property: "og:title", content: "Ouvidoria — Registre sua manifestação" },
      { property: "og:description", content: "Canal oficial de ouvidoria. Manifestações públicas, sigilosas ou anônimas." },
    ],
  }),
  component: OuvidoriaPublicaPage,
});

type Sigilo = "publico" | "sigiloso" | "anonimo";

function OuvidoriaPublicaPage() {
  const [sigilo, setSigilo] = useState<Sigilo>("publico");
  const [categoria, setCategoria] = useState<CategoriaPersistidaProtocolo>("reclamacao");
  const [secretariaId, setSecretariaId] = useState<string>("");
  const [localId, setLocalId] = useState<string>("");
  const [grupoAssunto, setGrupoAssunto] = useState("");
  const [assuntoEspecifico, setAssuntoEspecifico] = useState("");
  const [descricao, setDescricao] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ipSolicitante, setIpSolicitante] = useState<string | null>(null);
  const [geoSolicitante, setGeoSolicitante] = useState<{ lat: number; lng: number } | null>(null);
  const [sucesso, setSucesso] = useState<{ numero: string; hash: string; pdf: ProtocoloPdfData } | null>(null);

  // Coleta IP público e geolocalização do navegador (silenciosamente).
  useEffect(() => {
    let cancelado = false;
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((j) => { if (!cancelado && j?.ip) setIpSolicitante(String(j.ip)); })
      .catch(() => {});
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelado) return;
          setGeoSolicitante({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    }
    return () => { cancelado = true; };
  }, []);

  const itensDoGrupo = ASSUNTOS_OUVIDORIA.find((a) => a.grupo === grupoAssunto)?.itens ?? [];

  const { data: secretarias = [] } = useQuery({
    queryKey: ["pub-secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("id,nome,sigla").order("nome")).data ?? [],
  });
  const { data: locais = [] } = useQuery({
    queryKey: ["pub-locais"],
    queryFn: async () => (await supabase.from("locais").select("id,nome,secretaria_id").order("nome")).data ?? [],
  });

  const isSaude = grupoAssunto === "Saúde";
  const saudeSecretaria = secretarias.find(
    (s) => /sa[uú]de/i.test(s.nome) || (s.sigla && /sms|semsa|sesau/i.test(s.sigla)),
  );
  const ubsLocais = saudeSecretaria
    ? locais.filter(
        (l) => l.secretaria_id === saudeSecretaria.id,
      )
    : [];

  const enviar = useMutation({
    mutationFn: async () => {
      if (!grupoAssunto) throw new Error("Selecione a área/assunto.");
      if (!descricao.trim()) throw new Error("Descreva sua manifestação.");
      if (sigilo !== "anonimo" && !nome.trim()) throw new Error("Informe seu nome.");
      if (sigilo === "publico") {
        if (!cpf.trim()) throw new Error("Informe seu CPF.");
        if (!telefone.trim() && !email.trim()) throw new Error("Informe telefone ou e-mail para contato.");
      }
      if (sigilo === "sigiloso" && !telefone.trim() && !email.trim()) {
        throw new Error("Informe telefone ou e-mail para retorno sigiloso.");
      }

      const numero = gerarNumeroProtocolo("ouvidoria");
      const hash = gerarHashConsulta();
      const contatoPartes = [
        cpf.trim() ? `CPF: ${cpf.trim()}` : null,
        telefone.trim() ? `Tel: ${telefone.trim()}` : null,
        email.trim() ? `Email: ${email.trim()}` : null,
      ].filter(Boolean);
      const contatoStr = contatoPartes.join(" | ");
      const solicitante =
        sigilo === "anonimo"
          ? "Anônimo"
          : nome.trim() + (sigilo === "publico" && (email.trim() || telefone.trim()) ? ` <${email.trim() || telefone.trim()}>` : "");

      const assuntoTexto = grupoAssunto;
      const secretariaParaSalvar = isSaude ? saudeSecretaria?.id ?? null : null;
      const localParaSalvar = isSaude ? (localId || null) : null;

      const payload = {
        numero,
        tipo: "ouvidoria" as const,
        categoria,
        status: "aberto" as const,
        assunto: assuntoTexto,
        descricao: descricao.trim(),
        secretaria_id: secretariaParaSalvar,
        local_id: localParaSalvar,
        solicitante,
        sigilo,
        contato_solicitante: sigilo === "anonimo" ? null : (contatoStr || null),
        endereco: endereco.trim() || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        origem: "Site - Ouvidoria Pública",
        data_abertura: new Date().toISOString().slice(0, 10),
        created_by: null,
        hash_consulta: hash,
        ip_solicitante: ipSolicitante,
        lat_solicitante: geoSolicitante?.lat ?? null,
        lng_solicitante: geoSolicitante?.lng ?? null,
      };

      // Roda em paralelo com um delay mínimo de 3s para dar sensação de processamento.
      const [{ error }] = await Promise.all([
        supabase.from("protocolos").insert(payload),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      if (error) throw error;
      const pdfData: ProtocoloPdfData = {
        numero,
        hash,
        categoria: CATEGORIAS.find((c) => c.value === categoria)?.label ?? categoria,
        assunto: assuntoTexto,
        descricao: descricao.trim(),
        solicitante,
        sigilo,
        contato: contatoStr || null,
        endereco: endereco.trim() || null,
        secretaria: isSaude ? saudeSecretaria?.nome ?? null : null,
        local: isSaude ? locais.find((l) => l.id === localId)?.nome ?? null : null,
        data_abertura: payload.data_abertura,
        status: "Aberto",
        origem: payload.origem,
      };
      return { numero, hash, pdf: pdfData };
    },
    onSuccess: (d) => {
      setSucesso({ numero: d.numero, hash: d.hash, pdf: d.pdf });
      toast.success("Manifestação registrada com sucesso!");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao registrar manifestação."),
  });

  if (sucesso) {
    const baixarPdf = () => gerarProtocoloPdf(sucesso.pdf).save(`ouvidoria-${sucesso.numero}.pdf`);
    const imprimirPdf = () => {
      const doc = gerarProtocoloPdf(sucesso.pdf);
      doc.autoPrint();
      window.open(doc.output("bloburl"), "_blank");
    };
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-lg border-2">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">Manifestação registrada</CardTitle>
            <CardDescription>
              Sua manifestação foi protocolada e será analisada pela equipe responsável.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Número do protocolo</p>
              <p className="font-mono text-2xl font-bold text-primary mt-1">{sucesso.numero}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(sucesso.numero);
                  toast.success("Número copiado!");
                }}
              >
                <Copy className="h-3 w-3 mr-1" /> Copiar
              </Button>
            </div>
            <div className="rounded-lg border-2 border-dashed border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">Código de consulta</p>
              <p className="font-mono text-xl font-bold text-amber-900 dark:text-amber-200 mt-1 tracking-wider">{sucesso.hash}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(sucesso.hash);
                  toast.success("Código copiado!");
                }}
              >
                <Copy className="h-3 w-3 mr-1" /> Copiar código
              </Button>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-2">
                ⚠️ Guarde este código. Ele é exigido para consultar sua manifestação.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={baixarPdf}>
                <Download className="h-4 w-4 mr-1" /> Baixar PDF
              </Button>
              <Button variant="outline" onClick={imprimirPdf}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/consulta" search={{ numero: sucesso.numero, hash: sucesso.hash }}>
                <Search className="h-4 w-4 mr-1" /> Consultar minha manifestação
              </Link>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Guarde o número do protocolo e o código de consulta para acompanhar o andamento.
            </p>
            <Button className="w-full" onClick={() => { setSucesso(null); resetForm(); }}>
              Registrar outra manifestação
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  function resetForm() {
    setSigilo("publico");
    setCategoria("reclamacao");
    setSecretariaId("");
    setLocalId("");
    setGrupoAssunto("");
    setAssuntoEspecifico("");
    setDescricao("");
    setNome("");
    setCpf("");
    setTelefone("");
    setEmail("");
    setEndereco("");
    setCoords(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-background to-red-50 dark:from-emerald-950/20 dark:via-background dark:to-red-950/20 relative">
      {enviar.isPending && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-emerald-600/20 border-t-emerald-600 animate-spin" />
            <img src={brusqueBrasao} alt="" className="absolute inset-0 m-auto h-8 w-8 object-contain" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Enviando sua manifestação…</p>
            <p className="text-xs text-muted-foreground mt-1">Aguarde, estamos protocolando seu registro.</p>
          </div>
        </div>
      )}
      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-white to-red-600" />
      <header className="border-b bg-background/90 backdrop-blur shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-5 flex items-center gap-4">
          <img
            src={brusqueBrasao}
            alt="Brasão de Brusque - SC"
            className="h-16 w-16 object-contain shrink-0 drop-shadow-sm"
            width={64}
            height={64}
          />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-semibold">
              Prefeitura Municipal de Brusque · SC
            </p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Ouvidoria Municipal</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Canal oficial para elogios, reclamações, denúncias, sugestões e pedidos de informação.
            </p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/inicio">
                <ArrowLeft className="h-4 w-4 mr-1" /> Início
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/consulta">
                <Search className="h-4 w-4 mr-1" /> Consultar protocolo
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" /> Tipo de manifestação
            </CardTitle>
            <CardDescription>Escolha como deseja se identificar nesta manifestação.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={sigilo} onValueChange={(v) => setSigilo(v as Sigilo)} className="grid gap-3 md:grid-cols-3">
              <label
                htmlFor="sig-pub"
                className={`cursor-pointer rounded-lg border-2 p-4 transition ${sigilo === "publico" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RadioGroupItem id="sig-pub" value="publico" />
                  <Eye className="h-4 w-4" />
                  <span className="font-medium">Pública</span>
                </div>
                <p className="text-xs text-muted-foreground">Sua identificação fica visível para a equipe e para o setor responsável.</p>
              </label>
              <label
                htmlFor="sig-sig"
                className={`cursor-pointer rounded-lg border-2 p-4 transition ${sigilo === "sigiloso" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RadioGroupItem id="sig-sig" value="sigiloso" />
                  <EyeOff className="h-4 w-4" />
                  <span className="font-medium">Sigilosa</span>
                </div>
                <p className="text-xs text-muted-foreground">Sua identidade é preservada e tratada com sigilo pela ouvidoria.</p>
              </label>
              <label
                htmlFor="sig-anon"
                className={`cursor-pointer rounded-lg border-2 p-4 transition ${sigilo === "anonimo" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RadioGroupItem id="sig-anon" value="anonimo" />
                  <UserX className="h-4 w-4" />
                  <span className="font-medium">Anônima</span>
                </div>
                <p className="text-xs text-muted-foreground">Nenhum dado pessoal é registrado. Você não receberá retorno individual.</p>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {sigilo !== "anonimo" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Seus dados</CardTitle>
              <CardDescription>
                {sigilo === "sigiloso"
                  ? "Seus dados ficarão sob sigilo da ouvidoria e não serão divulgados ao setor envolvido."
                  : "Seus dados serão usados para retorno e podem ser visualizados pelo setor responsável."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Nome completo *</Label>
                <Input maxLength={120} value={nome} onChange={e => setNome(e.target.value)} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label>CPF {sigilo === "publico" ? "*" : ""}</Label>
                  <Input
                    maxLength={14}
                    value={cpf}
                    onChange={e => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Telefone *</Label>
                  <Input
                    maxLength={20}
                    value={telefone}
                    onChange={e => setTelefone(e.target.value)}
                    placeholder="(47) 99999-9999"
                    inputMode="tel"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>E-mail *</Label>
                  <Input
                    type="email"
                    maxLength={120}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {sigilo === "publico"
                  ? "CPF é obrigatório. Informe telefone e/ou e-mail (pelo menos um) para contato."
                  : "Informe telefone e/ou e-mail (pelo menos um) para retorno sigiloso."}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sobre a manifestação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Tipo de solicitação *</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaPersistidaProtocolo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.filter(c => c.value !== "esic").map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Área / Tema *</Label>
              <Select
                value={grupoAssunto || "none"}
                onValueChange={(v) => {
                  setGrupoAssunto(v === "none" ? "" : v);
                  setAssuntoEspecifico("");
                  setLocalId("");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {ASSUNTOS_OUVIDORIA.map((a) => (
                    <SelectItem key={a.grupo} value={a.grupo}>{a.grupo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSaude && (
              <div className="grid gap-2">
                <Label>Unidade de Saúde (UBS)</Label>
                <Select value={localId || "none"} onValueChange={(v) => setLocalId(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={ubsLocais.length ? "Selecione a UBS" : "Nenhuma UBS cadastrada"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não se aplica</SelectItem>
                    {ubsLocais.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Descrição detalhada *</Label>
              <Textarea
                rows={6}
                maxLength={3000}
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Descreva o que aconteceu, quando, onde e quem está envolvido."
              />
              <p className="text-[11px] text-muted-foreground text-right">{descricao.length}/3000</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Localização (opcional)
            </CardTitle>
            <CardDescription>
              Informe o endereço relacionado à manifestação. Você também pode marcar o ponto exato no mapa.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label>Endereço</Label>
              <AddressAutocomplete
                value={endereco}
                onChange={(v) => {
                  setEndereco(v);
                  setCoords(null);
                }}
                onResolve={(s) => {
                  if (endereco.trim().length >= 3) setCoords({ lat: s.lat, lng: s.lng });
                }}
                onSelect={(s) => {
                  setEndereco(s.endereco);
                  setCoords({ lat: s.lat, lng: s.lng });
                }}
                placeholder="Comece a digitar a rua em Brusque…"
              />
              <p className="text-[11px] text-muted-foreground">
                Sugestões automáticas de ruas e locais de Brusque-SC.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
                <MapPin className="h-4 w-4 mr-1" /> {coords ? "Ajustar ponto no mapa" : "Marcar ponto no mapa"}
              </Button>
              {coords && (
                <span className="text-xs text-muted-foreground">
                  📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
              )}
              {coords && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCoords(null)}>Remover</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pb-10">
          <Button
            size="lg"
            onClick={() => enviar.mutate()}
            disabled={enviar.isPending}
            className="bg-emerald-700 hover:bg-emerald-800 text-white shadow-md"
          >
            {enviar.isPending ? (
              <>
                <span className="mr-2 inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar manifestação
              </>
            )}
          </Button>
        </div>
      </main>

      <footer className="border-t bg-background/60">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center text-[11px] text-muted-foreground">
          Prefeitura Municipal de Brusque — Santa Catarina
        </div>
      </footer>

      <MapPointPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initial={coords}
        endereco={endereco}
        onConfirm={(lat, lng, addr) => {
          setCoords({ lat, lng });
          if (addr && addr.trim().length > 0) setEndereco(addr);
        }}
        protocoloContext={{
          assunto: grupoAssunto || "",
          descricao,
          endereco,
          secretaria: isSaude ? saudeSecretaria?.nome : undefined,
          local: isSaude ? locais.find((l) => l.id === localId)?.nome : undefined,
          categoria,
        }}
      />
    </div>
  );
}
