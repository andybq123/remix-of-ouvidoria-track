import { formatarNumeroEsic } from "@/lib/esic";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { calcularPrazo, situacaoProtocolo, situacaoClasses, situacaoLabel, formatDate, gerarNumeroProtocolo, PRAZOS, CATEGORIAS, categoriaLabel, categoriaSigla, categoriaBadgeClass, categoriaDoProtocolo, categoriaPersistida, type TipoProtocolo, type CategoriaProtocolo } from "@/lib/prazo";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";
import { termosBusca, matchProtocolo, matchNumero } from "@/lib/search-protocolos";
import { SlaBadge } from "@/components/sla-badge";
import { Plus, Calendar, RotateCw, CheckCircle2, Trash2, Sparkles, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { extrairProtocolo } from "@/lib/protocolo-extract.functions";
import { geocodeAddress } from "@/lib/geocode.functions";
import { useServerFn } from "@tanstack/react-start";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapPointPicker } from "@/components/map-point-picker";
import { mapDepartmentOf } from "@/lib/map-departments";
import { currentMonthValue, monthOptionsFromDates, isInMonth } from "@/lib/month-filter";
import { importarProtocolosAntigos } from "@/lib/protocolos-antigos-import.functions";
import { invalidateProtocoloCaches } from "@/hooks/use-protocolos-realtime";

export const Route = createFileRoute("/_authenticated/protocolos")({
  head: () => ({ meta: [
    { title: "Protocolos e triagem | OuviDesk" },
    { name: "description", content: "Protocolos e triagem no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Protocolos e triagem | OuviDesk" },
    { property: "og:description", content: "Protocolos e triagem no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProtocolosPage,
});

function ProtocolosPage() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<any | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todos");
  const [filtroSec, setFiltroSec] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [dataIni, setDataIni] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [mes, setMes] = useState<string>(currentMonthValue());

  const { data: protocolos = [] } = useQuery({
    queryKey: ["protocolos", "atuais"],
    queryFn: async () => {
      const rows = await fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("*, secretarias(nome, sigla), locais(nome)")
          .eq("triagem_pendente", false)
          .or("origem.is.null,origem.not.like.antigo:%")
          .order("data_abertura", { ascending: false })
          .range(from, to),
      );
      return [...rows].sort(sortProtocolosPorNumero);
    },
  });

  // Antigos só carregam sob demanda (mês "antigos"), para manter a listagem principal rápida.
  const carregarAntigos = mes === "antigos";
  const { data: antigos = [], isFetching: antigosFetching } = useQuery({
    queryKey: ["protocolos", "antigos"],
    enabled: carregarAntigos,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = await fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("*, secretarias(nome, sigla), locais(nome)")
          .like("origem", "antigo:%")
          .order("data_abertura", { ascending: false })
          .range(from, to),
      );
      return [...rows].sort(sortProtocolosPorNumero);
    },
  });

  const importar = useServerFn(importarProtocolosAntigos);
  const importMutation = useMutation({
    mutationFn: async () => importar(),
    onSuccess: (r: any) => {
      if (r.erros?.length) {
        toast.error(`Importados ${r.inseridos}. Erros: ${r.erros.slice(0, 2).join(" | ")}`);
      } else {
        toast.success(`Importados ${r.inseridos} protocolos antigos (${r.pulados_duplicados} duplicados)`);
      }
      qc.invalidateQueries({ queryKey: ["protocolos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao importar"),
  });

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("*").order("nome")).data ?? [],
  });

  // ID da secretaria de Saúde — protocolos dessa secretaria aparecem só na aba Saúde
  const { data: saudeSecId } = useQuery({
    queryKey: ["secretaria-saude-id"],
    queryFn: async () => {
      const { data } = await supabase.from("secretarias").select("id").eq("nome", "Saúde").maybeSingle();
      return data?.id ?? null;
    },
  });

  const { data: locais = [] } = useQuery({
    queryKey: ["locais"],
    queryFn: async () => (await supabase.from("locais").select("*").order("nome")).data ?? [],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("protocolos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["protocolos"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("protocolos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["protocolos"] }); toast.success("Protocolo removido"); },
  });

  const protocolosComAntigos = useMemo(
    () => (carregarAntigos ? antigos : protocolos),
    [carregarAntigos, protocolos, antigos],
  );

  const isAntigo = (p: any) =>
    typeof p?.origem === "string" && p.origem.startsWith("antigo:");

  // Busca global (motor compartilhado com a Saúde): sem acentos, multi-termo,
  // cobrindo número, assunto, relato, resolução, endereço, secretaria, unidade,
  // categoria, tipo, status e solicitante.
  const termos = termosBusca(busca);
  const buscando = termos.length > 0;

  const filtrados = protocolosComAntigos.filter(p => {
    if (!isAntigo(p) && saudeSecId && p.secretaria_id === saudeSecId) return false;
    // Concluídos só aparecem quando filtrados explicitamente, buscados pelo número
    // ou quando estamos vendo os Protocolos Antigos (a maioria já está concluída).
    if (p.status === "concluido"
        && mes !== "antigos"
        && filtroStatus !== "concluido"
        && !(buscando && matchNumero(p, busca))) {
      return false;
    }
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
    if (filtroCategoria !== "todos" && categoriaDoProtocolo(p.tipo, p.categoria) !== filtroCategoria) return false;
    if (filtroSec !== "todos" && p.secretaria_id !== filtroSec) return false;
    if (dataIni || dataFim) {
      if (dataIni && (p.data_abertura ?? "") < dataIni) return false;
      if (dataFim && (p.data_abertura ?? "") > dataFim) return false;
    } else if (mes !== "all" && mes !== "antigos" && !buscando) {
      if (!isInMonth(p.data_abertura, mes)) return false;
    }
    if (!matchProtocolo(p, termos)) return false;
    return true;
  });

  const opcoesMes = monthOptionsFromDates(protocolos.map(p => p.data_abertura));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocolos</h1>
          <p className="text-sm text-muted-foreground">{filtrados.length} de {protocolosComAntigos.length}</p>
        </div>
        <div className="flex items-center gap-2">
          {mes === "antigos" && !antigosFetching && antigos.length === 0 && (
            <Button variant="secondary" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              <Download className="h-4 w-4 mr-1" />
              {importMutation.isPending ? "Importando…" : "Importar antigos"}
            </Button>
          )}
          <NovoProtocoloDialog secretarias={secretarias} locais={locais} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar nº, assunto, relato, secretaria, unidade…" value={busca} onChange={e => setBusca(e.target.value)} className="w-[280px]" />
        {buscando && (
          <span className="self-center text-[11px] text-muted-foreground">buscando em todo o período</span>
        )}
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
            <SelectItem value="esic">e-SIC</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {CATEGORIAS.map(c => (
              <SelectItem key={c.value} value={c.value}>
                <span className="font-mono mr-2">{c.sigla}</span>{c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="concluido">Concluído</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroSec} onValueChange={setFiltroSec}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as secretarias</SelectItem>
            {secretarias.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent className="max-h-[320px]">
            <SelectItem value="all">Todos os meses</SelectItem>
            <SelectItem value="antigos">Protocolos Antigos</SelectItem>
            {opcoesMes.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="w-[150px]" />
          <Label className="text-xs text-muted-foreground">até</Label>
          <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-[150px]" />
          {(dataIni || dataFim) && (
            <Button size="sm" variant="ghost" onClick={() => { setDataIni(""); setDataFim(""); }}>Limpar</Button>
          )}
        </div>
        {(dataIni || dataFim) && (
          <span className="text-[11px] text-muted-foreground">(período personalizado ignora o filtro de mês)</span>
        )}
      </div>

      <div className="grid gap-3">
        {filtrados.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum protocolo encontrado.</CardContent></Card>
        )}
        {filtrados.map(p => {
          const s = situacaoProtocolo(p as any);
          const categoriaVisivel = categoriaDoProtocolo(p.tipo, p.categoria);
          return (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{p.numero}</span>
                      {p.tipo === "esic" && p.numero_esic && (
                        <Badge variant="outline" className="border-teal-600 text-teal-800 dark:text-teal-300 text-[10px]">
                          Nº e-SIC {p.numero_esic}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] uppercase">{PRAZOS[p.tipo as TipoProtocolo].label}</Badge>
                      <Badge
                        className={`text-[10px] ${categoriaBadgeClass(categoriaVisivel)}`}
                        title={categoriaLabel(categoriaVisivel)}
                      >
                        {categoriaLabel(categoriaVisivel)}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{p.status.replace("_", " ")}</Badge>
                      {p.prorrogado && <Badge variant="outline" className="text-[10px]">prorrogado</Badge>}
                      <SlaBadge protocolo={p as any} />
                      {(p as any).origem && (
                        <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/30 text-primary">
                          {(p as any).origem}
                        </Badge>
                      )}
                      {(p as any).sigilo && (p as any).sigilo !== "publico" && (
                        <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">
                          {(p as any).sigilo === "anonimo" ? "Anônimo" : "Sigiloso"}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold mt-2">{p.assunto}</h3>
                    {p.descricao && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span><Calendar className="inline h-3 w-3 mr-1" />Aberto {formatDate(p.data_abertura)}</span>
                      <span>Prazo {formatDate(s.prazoFinal)}</span>
                      {(p as any).secretarias && <span>📍 {(p as any).secretarias.nome}</span>}
                      {p.solicitante && <span>✉ {p.solicitante}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setDetail(p)}>
                      <Eye className="h-3 w-3 mr-1" /> Detalhes
                    </Button>
                    {p.status !== "concluido" && !p.prorrogado && (
                      <Button size="sm" variant="outline"
                        onClick={() => p.tipo === "esic"
                          ? setDetail(p)
                          : updateMutation.mutate({ id: p.id, patch: { prorrogado: true, data_prorrogacao: new Date().toISOString().slice(0, 10) } })}>
                        <RotateCw className="h-3 w-3 mr-1" /> {p.tipo === "esic" ? "Prorrogar e-SIC" : "Prorrogar"}
                      </Button>
                    )}
                    {p.status !== "concluido" && (
                      <Button size="sm"
                        onClick={() => updateMutation.mutate({ id: p.id, patch: { status: "concluido", data_conclusao: new Date().toISOString().slice(0, 10) } })}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir
                      </Button>
                    )}
                    {p.status === "aberto" && (
                      <Button size="sm" variant="secondary"
                        onClick={() => updateMutation.mutate({ id: p.id, patch: { status: "em_andamento" } })}>
                        Iniciar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir protocolo?")) deleteMutation.mutate(p.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ProtocoloDetailDialog protocolo={detail} open={!!detail} onOpenChange={(v) => !v && setDetail(null)} />
    </div>
  );
}

function NovoProtocoloDialog({ secretarias, locais }: { secretarias: any[]; locais: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoProtocolo>("ouvidoria");
  const [categoria, setCategoria] = useState<CategoriaProtocolo>("reclamacao");
  const [numero, setNumero] = useState("");
  const [numeroEsic, setNumeroEsic] = useState("");
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [secretariaId, setSecretariaId] = useState<string>("");
  const [localId, setLocalId] = useState<string>("");
  const [solicitante, setSolicitante] = useState("");
  const [dataAbertura, setDataAbertura] = useState(new Date().toISOString().slice(0, 10));
  const [endereco, setEndereco] = useState("");
  const [enderecoCoords, setEnderecoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [enderecoTemNumero, setEnderecoTemNumero] = useState<boolean>(false);
  const [enderecoExact, setEnderecoExact] = useState<boolean>(false);
  const [confirmImprecise, setConfirmImprecise] = useState(false);
  const [forceSaveNoCoords, setForceSaveNoCoords] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [textoColar, setTextoColar] = useState("");
  const [extraindo, setExtraindo] = useState(false);
  const [sugestao, setSugestao] = useState<{ secretaria?: string; local?: string } | null>(null);
  const extrair = useServerFn(extrairProtocolo);
  const geocode = useServerFn(geocodeAddress);

  const locaisFiltrados = locais.filter(l => !secretariaId || l.secretaria_id === secretariaId);
  const vaiParaTriagem = tipo === "esic"
    || mapDepartmentOf(secretarias.find((s) => s.id === secretariaId) ?? {}) === "obras";

  async function handleExtrair() {
    if (!textoColar.trim()) return;
    setExtraindo(true);
    try {
      const r = await extrair({ data: { texto: textoColar } });
      const tipoExtraido = r.tipo as TipoProtocolo;
      if (r.numero && tipoExtraido === "esic") {
        setNumero("");
        setNumeroEsic(r.numero);
      } else if (r.numero) {
        setNumero(r.numero);
      }
      setTipo(tipoExtraido);
      setCategoria(tipoExtraido === "esic" ? "esic" : r.categoria as CategoriaProtocolo);
      if (tipoExtraido === "esic") {
        setSecretariaId("");
        setLocalId("");
      }
      if (r.assunto) setAssunto(r.assunto);
      if (r.descricao) setDescricao(r.descricao);
      if (r.solicitante) setSolicitante(r.solicitante);
      if (r.data_abertura) setDataAbertura(r.data_abertura);

      // tenta casar secretaria sugerida
      let secMatched = "";
      if (tipoExtraido !== "esic" && r.secretaria_sugerida) {
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const alvo = norm(r.secretaria_sugerida);
        const hit = secretarias.find(s => norm(s.nome).includes(alvo) || alvo.includes(norm(s.nome)) || (s.sigla && norm(s.sigla) === alvo));
        if (hit) { setSecretariaId(hit.id); secMatched = hit.id; }
      }
      if (tipoExtraido !== "esic" && r.local_sugerido && secMatched) {
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const alvo = norm(r.local_sugerido);
        const hit = locais.find(l => l.secretaria_id === secMatched && (norm(l.nome).includes(alvo) || alvo.includes(norm(l.nome))));
        if (hit) setLocalId(hit.id);
      }
      setSugestao(tipoExtraido === "esic" ? null : { secretaria: r.secretaria_sugerida, local: r.local_sugerido });
      toast.success("Dados extraídos. Revise antes de salvar.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha na extração");
    } finally {
      setExtraindo(false);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!assunto.trim()) throw new Error("Informe o assunto do pedido.");
      if (tipo === "esic" && !numeroEsic.trim()) throw new Error("Informe o número do pedido e-SIC.");
      const { data: { user } } = await supabase.auth.getUser();
      let lat: number | null = null;
      let lng: number | null = null;
      if (enderecoCoords && enderecoExact) {
        lat = enderecoCoords.lat;
        lng = enderecoCoords.lng;
      } else if (forceSaveNoCoords) {
        // user confirmed saving without coordinates
        lat = null;
        lng = null;
      } else if (endereco.trim()) {
        try {
          const r = await geocode({ data: { endereco } });
          lat = r.lat;
          lng = r.lng;
        } catch {
          toast.warning("Falha ao geocodificar o endereço.");
        }
      }
      const { error } = await supabase.from("protocolos").insert({
        numero: tipo === "esic" ? formatarNumeroEsic(numeroEsic) : (numero || gerarNumeroProtocolo(tipo)),
        numero_esic: tipo === "esic" ? (formatarNumeroEsic(numeroEsic) || null) : null,
        tipo, categoria: categoriaPersistida(tipo, categoria), assunto, descricao: descricao || null,
        secretaria_id: secretariaId || null,
        local_id: localId || null,
        solicitante: solicitante || null,
        data_abertura: dataAbertura,
        endereco: endereco || null,
        latitude: lat,
        longitude: lng,
        created_by: user?.id,
        triagem_pendente: vaiParaTriagem,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProtocoloCaches(qc);
      toast.success(vaiParaTriagem ? "Protocolo cadastrado para triagem" : "Protocolo cadastrado");
      setOpen(false);
      setTipo("ouvidoria"); setCategoria("reclamacao"); setNumero(""); setNumeroEsic("");
      setAssunto(""); setDescricao(""); setSecretariaId(""); setLocalId(""); setSolicitante(""); setEndereco("");
      setEnderecoCoords(null);
      setEnderecoExact(false);
      setEnderecoTemNumero(false);
      setForceSaveNoCoords(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleSubmit() {
    if (tipo === "esic" && !numeroEsic.trim()) {
      toast.error("Informe o número do pedido e-SIC.");
      return;
    }
    // Address provided but no precise coords yet → require explicit confirmation.
    if (endereco.trim() && !(enderecoCoords && enderecoExact)) {
      // Try a server lookup first to see if Nominatim has an exact match anyway.
      try {
        const r = await geocode({ data: { endereco } });
        if (r.lat != null && r.exact) {
          // exact match found server-side → accept and save directly
          setEnderecoCoords({ lat: r.lat, lng: r.lng! });
          setEnderecoExact(true);
          create.mutate();
          return;
        }
      } catch {
        // ignore, fall through to confirmation
      }
      setConfirmImprecise(true);
      return;
    }
    create.mutate();
  }

  const previewPrazo = calcularPrazo({ tipo, data_abertura: dataAbertura, prorrogado: false });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> Novo protocolo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo protocolo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border-2 border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Extração automática com IA
            </div>
            <p className="text-xs text-muted-foreground">
              Cole o e-mail / texto do protocolo abaixo. A IA preenche os campos automaticamente. Revise antes de salvar.
            </p>
            <Textarea
              placeholder="Cole aqui o texto do protocolo, e-mail ou mensagem…"
              value={textoColar}
              onChange={e => setTextoColar(e.target.value)}
              rows={4}
            />
            <div className="flex items-center justify-between gap-2">
              <Button type="button" size="sm" onClick={handleExtrair} disabled={!textoColar.trim() || extraindo}>
                <Sparkles className="h-3 w-3 mr-1" />
                {extraindo ? "Extraindo…" : "Extrair dados"}
              </Button>
              {textoColar && (
                <Button type="button" size="sm" variant="ghost" onClick={() => { setTextoColar(""); setSugestao(null); }}>
                  Limpar
                </Button>
              )}
            </div>
            {sugestao && (sugestao.secretaria || sugestao.local) && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {sugestao.secretaria && <p>💡 Secretaria sugerida: <strong>{sugestao.secretaria}</strong></p>}
                {sugestao.local && <p>💡 Local sugerido: <strong>{sugestao.local}</strong></p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={v => {
                const novoTipo = v as TipoProtocolo;
                setTipo(novoTipo);
                setCategoria(novoTipo === "esic" ? "esic" : categoria === "esic" ? "reclamacao" : categoria);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
                  <SelectItem value="esic">e-SIC (Acesso à Informação)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data de abertura *</Label>
              <Input type="date" value={dataAbertura} onChange={e => setDataAbertura(e.target.value)} />
            </div>
          </div>
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
            <Select value={categoria} onValueChange={v => setCategoria(v as CategoriaProtocolo)} disabled={tipo === "esic"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.filter(c => tipo === "esic" ? c.value === "esic" : c.value !== "esic").map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="font-mono mr-2">{c.sigla}</span>{c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tipo === "esic" ? "Número interno" : "Número interno (auto se vazio)"}</Label>
            <Input value={tipo === "esic" ? formatarNumeroEsic(numeroEsic) : numero} readOnly={tipo === "esic"} onChange={e => setNumero(e.target.value)} placeholder={tipo === "esic" ? "Ex.: 0.026/2026" : gerarNumeroProtocolo(tipo)} />
          </div>
          {tipo === "esic" && (
            <div className="space-y-1.5">
              <Label>Número do pedido e-SIC *</Label>
              <Input value={numeroEsic} onChange={e => setNumeroEsic(e.target.value)} placeholder="Ex.: 026/2026" required />
              <p className="text-[11px] text-muted-foreground">O pedido será marcado para triagem e terá prazo inicial de 20 dias.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Assunto *</Label>
            <Input value={assunto} onChange={e => setAssunto(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Breve descrição</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Solicitante</Label>
            <Input value={solicitante} onChange={e => setSolicitante(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Endereço (para mapa)</Label>
            <AddressAutocomplete
              value={endereco}
              onChange={(v) => { setEndereco(v); setEnderecoCoords(null); setEnderecoTemNumero(false); setEnderecoExact(false); }}
              onSelect={(s) => {
                setEndereco(s.label);
                setEnderecoCoords({ lat: s.lat, lng: s.lng });
                setEnderecoTemNumero(!!s.houseNumber);
                setEnderecoExact(s.exact !== false && !!s.houseNumber);
                if (!s.houseNumber) {
                  toast.warning("Sugestão sem número do imóvel. Inclua o número (ex.: \"Rua X, 174\") para um pino preciso.");
                }
              }}
              placeholder="Digite e selecione uma rua de Brusque…"
            />
            <p className="text-[11px] text-muted-foreground">
              Sugestões automáticas de ruas em Brusque/SC.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Secretaria</Label>
            <Select value={secretariaId} onValueChange={v => {
              setSecretariaId(v);
              const locaisDaSec = locais.filter(l => l.secretaria_id === v);
              setLocalId(locaisDaSec[0]?.id ?? "");
            }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {secretarias.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Select value={localId} onValueChange={setLocalId} disabled={!secretariaId}>
              <SelectTrigger><SelectValue placeholder={secretariaId ? "Selecione" : "Escolha uma secretaria"} /></SelectTrigger>
              <SelectContent>
                {locaisFiltrados.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-secondary p-3 text-xs">
            <strong>Prazo previsto:</strong> {formatDate(previewPrazo.prazoFinal)} ({previewPrazo.diasTotais} dias)
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!assunto || create.isPending}>Cadastrar</Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmImprecise} onOpenChange={setConfirmImprecise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Endereço sem localização precisa</AlertDialogTitle>
            <AlertDialogDescription>
              Não foi possível localizar este endereço com o número do imóvel. Para evitar
              um pino no meio da rua, você pode <strong>selecionar manualmente o ponto no mapa</strong>
              ou salvar o protocolo <strong>sem coordenadas</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Revisar endereço</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmImprecise(false);
                setPickerOpen(true);
              }}
            >
              Selecionar no mapa
            </Button>
            <AlertDialogAction onClick={() => {
              setForceSaveNoCoords(true);
              setConfirmImprecise(false);
              setTimeout(() => create.mutate(), 0);
            }}>Salvar sem mapa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MapPointPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initial={enderecoCoords}
        endereco={endereco}
        protocoloContext={{
          assunto,
          descricao,
          endereco,
          solicitante,
          secretaria: secretarias.find((s: any) => s.id === secretariaId)?.nome,
          local: locais.find((l: any) => l.id === localId)?.nome,
          categoria,
        }}
        onConfirm={(lat, lng) => {
          setEnderecoCoords({ lat, lng });
          setEnderecoExact(true);
          setForceSaveNoCoords(false);
          toast.success("Localização definida manualmente.");
          setTimeout(() => create.mutate(), 0);
        }}
      />
    </Dialog>
  );
}
