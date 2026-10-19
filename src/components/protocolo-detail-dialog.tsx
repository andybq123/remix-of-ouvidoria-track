import { formatarNumeroEsic } from "@/lib/esic";
import { urlValida1doc } from "@/lib/url-1doc";
import { useEffect, useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SlaBadge } from "@/components/sla-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, RotateCw, Trash2, Save, Pencil, X, History } from "lucide-react";
import { Inbox, Lock, ExternalLink, MapPin } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { invalidateProtocoloCaches } from "@/hooks/use-protocolos-realtime";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapPointPicker } from "@/components/map-point-picker";
import { mapDepartmentOf } from "@/lib/map-departments";
import {
  situacaoProtocolo, situacaoClasses, situacaoLabel, formatDate, calcularSla,
  PRAZOS, CATEGORIAS, categoriaLabel, categoriaSigla, categoriaBadgeClass, categoriaDoProtocolo, categoriaPersistida,
  type TipoProtocolo, type CategoriaProtocolo,
} from "@/lib/prazo";

export function ProtocoloDetailDialog({ protocolo: protocoloProp, open, onOpenChange }: {
  protocolo: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [concluirOpen, setConcluirOpen] = useState(false);
  const [concluirData, setConcluirData] = useState<string>("");
  const [prorrogarOpen, setProrrogarOpen] = useState(false);
  const [esicJustificativa, setEsicJustificativa] = useState("");
  const triagemActionRef = useRef<(() => Promise<void>) | null>(null);
  const [lockState, setLockState] = useState<
    | { kind: "idle" }
    | { kind: "mine" }
    | { kind: "reservada"; por: string; em: string }
    | { kind: "concluida"; por: string; em: string }
  >({ kind: "idle" });
  const [tooltipAberto, setTooltipAberto] = useState<string | null>(null);
  const [tooltipsLiberados, setTooltipsLiberados] = useState(false);

  // "Legado in-memory": só marcado quando o protocolo vem do JSON de antigos (sem row no banco).
  // Após a importação, antigos passam a ser rows normais e devem ser plenamente editáveis.
  const isLegacyProp = protocoloProp?.__antigo === true;

  const { data: protocoloFresh } = useQuery({
    queryKey: ["protocolo", protocoloProp?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protocolos")
        .select("*, secretarias(nome, sigla), locais(nome)")
        .eq("id", protocoloProp.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!protocoloProp?.id && !isLegacyProp,
  });
  const protocolo = protocoloFresh ?? protocoloProp;
  const isLegacy = protocolo?.__antigo === true;

  // Tenta reservar a triagem ao abrir; libera ao fechar
  useEffect(() => {
    if (!open || !protocolo?.id || !protocolo?.triagem_pendente) {
      setLockState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("reservar_triagem", { p_id: protocolo.id });
      if (cancelled) return;
      const r = data as any;
      if (r?.ok) setLockState({ kind: "mine" });
      else if (r?.motivo === "concluida") setLockState({ kind: "concluida", por: r.por, em: r.em });
      else if (r?.motivo === "reservada") setLockState({ kind: "reservada", por: r.por, em: r.em });
    })();
    return () => {
      cancelled = true;
      // só libera se a reserva é nossa
      if (protocolo?.id) {
        void supabase.rpc("liberar_triagem", { p_id: protocolo.id });
      }
    };
  }, [open, protocolo?.id, protocolo?.triagem_pendente]);

  const lockBloqueia = lockState.kind === "reservada" || lockState.kind === "concluida";

  useEffect(() => {
    setTooltipAberto(null);
    setTooltipsLiberados(false);
    if (!open) return;
    const timer = window.setTimeout(() => setTooltipsLiberados(true), 700);
    return () => window.clearTimeout(timer);
  }, [open, protocolo?.id]);

  // Atalhos de teclado no dialog
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editing) {
        e.stopPropagation();
        setEditing(false);
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (protocolo?.triagem_pendente && editing && !lockBloqueia) {
          e.preventDefault();
          void triagemActionRef.current?.();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, editing, protocolo?.triagem_pendente, lockBloqueia]);

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("*").order("nome")).data ?? [],
    enabled: open,
  });
  const { data: locais = [] } = useQuery({
    queryKey: ["locais"],
    queryFn: async () => (await supabase.from("locais").select("*").order("nome")).data ?? [],
    enabled: open,
  });
  const { data: historico = [] } = useQuery({
    queryKey: ["historico", protocolo?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("protocolo_historico" as any)
        .select("*")
        .eq("protocolo_id", protocolo.id)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: open && !!protocolo?.id && !isLegacy,
  });

  useEffect(() => {
    if (protocolo) {
      setForm({
        numero: protocolo.numero ?? "",
        numero_esic: protocolo.numero_esic ?? (protocolo.tipo === "esic" ? protocolo.numero : ""),
        tipo: protocolo.tipo,
        categoria: categoriaDoProtocolo(protocolo.tipo, protocolo.categoria),
        status: protocolo.status,
        assunto: protocolo.assunto ?? "",
        // Em triagem, o relato deve ser preenchido por quem está triando
        descricao: protocolo.triagem_pendente ? "" : (protocolo.descricao ?? ""),
        solicitante: protocolo.solicitante ?? "",
        secretaria_id: protocolo.secretaria_id ?? "",
        local_id: protocolo.local_id ?? "",
        data_abertura: protocolo.data_abertura ?? "",
        data_conclusao: protocolo.data_conclusao ?? "",
        data_prorrogacao: protocolo.data_prorrogacao ?? "",
        prorrogado: !!protocolo.prorrogado,
        esic_prorrogacao_justificativa: protocolo.esic_prorrogacao_justificativa ?? "",
        endereco: protocolo.endereco ?? "",
        latitude: protocolo.latitude ?? null,
        longitude: protocolo.longitude ?? null,
      });
      // Força modo edição em triagem para que o triador preencha a descrição obrigatória
      setEditing(!!protocolo.triagem_pendente);
    }
  }, [protocolo]);

  const update = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("protocolos").update(patch).eq("id", protocolo.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch: any) => {
      // Invalida toda a rede de caches ligados a protocolos (dashboard, listas,
      // relatórios, triagem, atrasados) para refletir a mudança imediatamente.
      invalidateProtocoloCaches(qc);
      qc.invalidateQueries({ queryKey: ["historico", protocolo.id] });
      const mudouConclusao =
        patch && (Object.prototype.hasOwnProperty.call(patch, "data_conclusao")
                  || Object.prototype.hasOwnProperty.call(patch, "status"));
      toast.success(
        mudouConclusao
          ? "Protocolo atualizado — KPIs recalculados"
          : "Protocolo atualizado",
      );
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("protocolos").delete().eq("id", protocolo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProtocoloCaches(qc);
      toast.success("Protocolo removido");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  if (!protocolo) return null;
  const s = situacaoProtocolo(protocolo);
  const sla = calcularSla(protocolo as any);

  const locaisFiltrados = locais.filter((l: any) => !form.secretaria_id || l.secretaria_id === form.secretaria_id);
  const secretariaSelecionada = secretarias.find((s) => s.id === form.secretaria_id)
    ?? protocolo.secretarias
    ?? {};
  const isObras = mapDepartmentOf(secretariaSelecionada) === "obras";

  function handleSave() {
    if (form.tipo === "esic" && !String(form.numero_esic ?? "").trim()) {
      toast.error("Informe o número do pedido e-SIC.");
      return;
    }
    if (form.tipo === "esic" && protocolo.tipo !== "esic" && form.prorrogado
        && String(form.esic_prorrogacao_justificativa ?? "").trim().length < 20) {
      toast.error("Registre a justificativa da prorrogação antes de converter este protocolo para e-SIC.");
      return;
    }
    if (isObras && form.endereco !== (protocolo.endereco ?? "") && String(form.endereco ?? "").trim()
        && (form.latitude == null || form.longitude == null)) {
      toast.error("Selecione uma sugestão de endereço ou marque o ponto no mapa antes de salvar.");
      return;
    }
    const patch: any = {
      numero: form.numero,
      numero_esic: form.tipo === "esic" ? formatarNumeroEsic(form.numero_esic) : null,
      ...(form.tipo === "esic" ? { esic_prorrogacao_justificativa: String(form.esic_prorrogacao_justificativa ?? "").trim() || null } : {}),
      tipo: form.tipo,
      categoria: categoriaPersistida(form.tipo as TipoProtocolo, form.categoria as CategoriaProtocolo),
      status: form.status,
      assunto: form.assunto,
      descricao: form.descricao || null,
      solicitante: form.solicitante || null,
      endereco: String(form.endereco ?? "").trim() || null,
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      secretaria_id: form.secretaria_id || null,
      local_id: form.local_id || null,
      data_abertura: form.data_abertura,
      data_conclusao: form.data_conclusao || null,
      data_prorrogacao: form.data_prorrogacao || null,
      prorrogado: form.prorrogado,
    };
    update.mutate(patch, { onSuccess: () => setEditing(false) });
  }

  function handleConcluir() {
    setConcluirData(new Date().toISOString().slice(0, 10));
    setConcluirOpen(true);
  }
  function confirmarConclusao() {
    if (!concluirData) {
      toast.error("Informe a data de conclusão.");
      return;
    }
    if (protocolo?.data_abertura && concluirData < protocolo.data_abertura) {
      toast.error("A data de conclusão não pode ser anterior à abertura.");
      return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    if (concluirData > hoje) {
      toast.error("A data de conclusão não pode ser futura.");
      return;
    }
    update.mutate(
      { status: "concluido", data_conclusao: concluirData },
      {
        onSuccess: () => {
          setConcluirOpen(false);
          setEditing(false);
          onOpenChange(false);
        },
      },
    );
  }
  function handleReabrir() {
    update.mutate({ status: "em_andamento", data_conclusao: null });
  }
  function handleProrrogar() {
    if (protocolo.tipo === "esic") {
      setEsicJustificativa("");
      setProrrogarOpen(true);
      return;
    }
    update.mutate({ prorrogado: true, data_prorrogacao: new Date().toISOString().slice(0, 10) });
  }

  function confirmarProrrogacaoEsic() {
    const justificativa = esicJustificativa.trim();
    if (justificativa.length < 20) {
      toast.error("A justificativa expressa deve ter ao menos 20 caracteres.");
      return;
    }
    update.mutate(
      {
        prorrogado: true,
        data_prorrogacao: new Date().toISOString().slice(0, 10),
        esic_prorrogacao_justificativa: justificativa,
      },
      { onSuccess: () => setProrrogarOpen(false) },
    );
  }

  async function handleConcluirTriagem() {
    if (!form.secretaria_id) {
      toast.error("Defina a secretaria antes de concluir a triagem.");
      return;
    }
    const relato = (form.descricao ?? "").trim();
    if (relato.length < 5) {
      toast.error("Informe uma descrição (breve relato) antes de concluir a triagem.");
      return;
    }
    if (form.tipo === "esic" && !String(form.numero_esic ?? "").trim()) {
      toast.error("Informe o número do pedido e-SIC antes de concluir a triagem.");
      return;
    }
    if (form.tipo === "esic" && protocolo.tipo !== "esic" && form.prorrogado
        && String(form.esic_prorrogacao_justificativa ?? "").trim().length < 20) {
      toast.error("Registre a justificativa da prorrogação antes de converter este protocolo para e-SIC.");
      return;
    }
    if (isObras && (!String(form.endereco ?? "").trim()
        || form.latitude == null || form.longitude == null)) {
      toast.error("Informe o endereço e marque o ponto no mapa para que o protocolo apareça no mapa de Obras.");
      return;
    }
    const { error: upErr } = await supabase
      .from("protocolos")
      .update({
        descricao: relato,
        tipo: form.tipo,
        categoria: categoriaPersistida(form.tipo as TipoProtocolo, form.categoria as CategoriaProtocolo),
        numero_esic: form.tipo === "esic" ? formatarNumeroEsic(form.numero_esic) : null,
        ...(form.tipo === "esic" ? { esic_prorrogacao_justificativa: String(form.esic_prorrogacao_justificativa ?? "").trim() || null } : {}),
        assunto: form.assunto,
        endereco: String(form.endereco ?? "").trim() || null,
        latitude: form.latitude ?? null,
        longitude: form.longitude ?? null,
        secretaria_id: form.secretaria_id || null,
        local_id: form.local_id || null,
      })
      .eq("id", protocolo.id);
    if (upErr) { toast.error(upErr.message); return; }
    const { data, error } = await supabase.rpc("concluir_triagem", {
      p_id: protocolo.id,
      p_secretaria: form.secretaria_id,
      p_local: (form.local_id || null) as any,
    });
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    if (r?.ok) {
      toast.success("Triagem concluída. Protocolo enviado ao módulo correspondente.");
      invalidateProtocoloCaches(qc);
      onOpenChange(false);
    } else if (r?.motivo === "concluida") {
      toast.error(`Já triada por ${r.por} em ${new Date(r.em).toLocaleString("pt-BR")}.`);
      setLockState({ kind: "concluida", por: r.por, em: r.em });
    } else if (r?.motivo === "reservada") {
      toast.error(`Reservada por ${r.por} desde ${new Date(r.em).toLocaleString("pt-BR")}.`);
      setLockState({ kind: "reservada", por: r.por, em: r.em });
    } else {
      toast.error("Não foi possível concluir a triagem.");
    }
  }
  // O listener de teclado lê a ação do render atual (inclui número/relato editados).
  triagemActionRef.current = handleConcluirTriagem;

  const wrapTooltip = (id: string, children: React.ReactNode, text: string) => (
    <Tooltip open={tooltipAberto === id}>
      <TooltipTrigger asChild>
        <span
          tabIndex={-1}
          className="inline-flex"
          onMouseEnter={() => {
            if (tooltipsLiberados) setTooltipAberto(id);
          }}
          onMouseLeave={() => setTooltipAberto(null)}
          onMouseDown={() => setTooltipAberto(null)}
          onFocus={() => setTooltipAberto(null)}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" onPointerDownOutside={() => setTooltipAberto(null)}>
        {text}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={200}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">{protocolo.numero}</span>
            {protocolo.tipo === "esic" && protocolo.numero_esic && (
              <Badge variant="outline" className="border-teal-600 text-teal-800 dark:text-teal-300 text-[10px]">
                Nº e-SIC {protocolo.numero_esic}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] uppercase">{PRAZOS[protocolo.tipo as TipoProtocolo].label}</Badge>
            <Badge
              className={`text-[10px] ${categoriaBadgeClass(categoriaDoProtocolo(protocolo.tipo, protocolo.categoria))}`}
              title={categoriaLabel(categoriaDoProtocolo(protocolo.tipo, protocolo.categoria))}
            >
              {categoriaLabel(categoriaDoProtocolo(protocolo.tipo, protocolo.categoria))}
            </Badge>
            <SlaBadge protocolo={protocolo as any} />
            {protocolo.prorrogado && <Badge variant="outline" className="text-[10px]">prorrogado</Badge>}
          </DialogTitle>
        </DialogHeader>

        {/* Faixa de prazo/SLA em destaque */}
        <div className="rounded-lg border bg-muted/40 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Abertura</div>
            <div className="font-medium">{formatDate(protocolo.data_abertura)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Prazo final</div>
            <div className="font-medium">{formatDate(sla.prazoFinal)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Situação</div>
            <div className="font-medium">{sla.label} · {sla.labelDias}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Conclusão</div>
            <div className="font-medium">{protocolo.data_conclusao ? formatDate(protocolo.data_conclusao) : "—"}</div>
          </div>
        </div>

        {lockState.kind === "reservada" && (
          <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-900 dark:text-blue-200 flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Esta tarefa está em triagem por <strong>{lockState.por}</strong>
            {" "}desde {new Date(lockState.em).toLocaleString("pt-BR")}. Você pode visualizar, mas não salvar enquanto a reserva estiver ativa (10 min).
          </div>
        )}
        {lockState.kind === "concluida" && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Esta tarefa já foi triada por <strong>{lockState.por}</strong> em {new Date(lockState.em).toLocaleString("pt-BR")}.
          </div>
        )}

        {/* Ações rápidas — apenas admins */}
        {isAdmin && <div className="flex flex-wrap items-center gap-2 border-y py-3">
          {/* Grupo principal (ações positivas / fluxo) */}
          <div className="flex flex-wrap items-center gap-2">
            {!isLegacy && protocolo.triagem_pendente && editing && (
              wrapTooltip(
                "concluir-triagem",
                <Button
                  size="sm"
                  onClick={handleConcluirTriagem}
                  disabled={update.isPending || lockBloqueia}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  <Inbox className="h-4 w-4 mr-1" /> Concluir triagem
                </Button>,
                "Finaliza a triagem encaminhando o protocolo à secretaria/local definidos (Ctrl + Enter)"
              )
            )}
            {urlValida1doc(protocolo?.url) && (
              wrapTooltip(
                "abrir-1doc",
                <a href={urlValida1doc(protocolo.url)!} target="_blank" rel="noopener noreferrer">
                  <Button
                    size="sm"
                    className="bg-sky-600 text-white hover:bg-sky-700"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" /> Abrir no 1Doc
                  </Button>
                </a>,
                "Abre o protocolo no sistema 1Doc em uma nova aba"
              )
            )}
            {!isLegacy && urlValida1doc(protocolo?.url) && (
              wrapTooltip(
                "agente-1doc",
                <span><OnedocAgentButton tipo="unitario" protocoloId={protocolo.id} label="Atualizar pelo 1Doc" /></span>,
                protocolo.onedoc_verificado_em
                  ? `Última conferência: ${new Date(protocolo.onedoc_verificado_em).toLocaleString("pt-BR")} — ${protocolo.onedoc_situacao ?? ""}${protocolo.onedoc_baixado_em ? `, baixa em ${new Date(protocolo.onedoc_baixado_em).toLocaleString("pt-BR")}` : ""}${protocolo.onedoc_arquivado_em ? `, arquivada em ${new Date(protocolo.onedoc_arquivado_em).toLocaleString("pt-BR")}` : ""}`
                  : "O agente entra no 1Doc e confere se a ouvidoria foi baixada e arquivada"
              )
            )}
            {!isLegacy && protocolo.status === "concluido" && (
              <Button size="sm" variant="outline" onClick={handleReabrir} disabled={update.isPending || lockBloqueia}>
                <RotateCw className="h-4 w-4 mr-1" /> Reabrir
              </Button>
            )}
            {!isLegacy && !protocolo.triagem_pendente && protocolo.status !== "concluido" && (
              <>
                <Button
                  size="sm"
                  onClick={handleConcluir}
                  disabled={update.isPending || lockBloqueia}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir
                </Button>
                {!protocolo.prorrogado && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleProrrogar}
                    disabled={update.isPending || lockBloqueia}
                  >
                    Prorrogar prazo
                  </Button>
                )}
              </>
            )}
            {!isLegacy && !protocolo.triagem_pendente && editing && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={update.isPending || lockBloqueia}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-1" /> Salvar alterações
              </Button>
            )}
          </div>

          {/* Grupo secundário (edição / cancelamento / exclusão) */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {!isLegacy && (!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={lockBloqueia}>
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
            ) : (
              wrapTooltip(
                "cancelar-edicao",
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>,
                "Descarta as alterações feitas no formulário (Esc)"
              )
            ))}
            {!isLegacy && (
              wrapTooltip(
                "excluir-protocolo",
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => { if (confirm("Excluir este protocolo permanentemente?")) del.mutate(); }}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>,
                "Remove permanentemente este protocolo e todo o seu histórico"
              )
            )}
          </div>
        </div>}
        {!isAdmin && urlValida1doc(protocolo?.url) && (
          <div className="border-y py-3">
            <a href={urlValida1doc(protocolo.url)!} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-sky-600 text-white hover:bg-sky-700">
                <ExternalLink className="h-4 w-4 mr-1" /> Abrir no 1Doc
              </Button>
            </a>
          </div>
        )}

        <Tabs defaultValue="detalhes" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="historico" className="gap-1">
              <History className="h-3.5 w-3.5" /> Histórico ({historico.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="detalhes" className="space-y-4">
        {!editing ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{protocolo.assunto}</h3>
              {protocolo.descricao && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{protocolo.descricao}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Status" value={protocolo.status?.replace("_", " ")} />
              <Field label="Prorrogado" value={protocolo.prorrogado ? "Sim" : "Não"} />
              <Field label="Data de abertura" value={formatDate(protocolo.data_abertura)} />
              {protocolo.tipo === "esic" && <Field label="Número do pedido e-SIC" value={protocolo.numero_esic ?? "Não informado"} />}
              <Field label="Prazo final" value={formatDate(s.prazoFinal)} />
              {protocolo.data_prorrogacao && <Field label="Data prorrogação" value={formatDate(protocolo.data_prorrogacao)} />}
              {protocolo.tipo === "esic" && protocolo.esic_prorrogacao_justificativa && (
                <div className="col-span-2 rounded-md border border-teal-700/30 bg-teal-700/5 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Justificativa da prorrogação e-SIC</p>
                  <p className="text-sm whitespace-pre-wrap">{protocolo.esic_prorrogacao_justificativa}</p>
                </div>
              )}
              {protocolo.data_conclusao && <Field label="Data conclusão" value={formatDate(protocolo.data_conclusao)} />}
              <Field label="Secretaria" value={protocolo.secretarias?.nome ?? "—"} />
              {protocolo.locais && <Field label="Local" value={protocolo.locais.nome} />}
              {isLegacy && <Field label="Origem" value={(protocolo as any).__source ?? protocolo.origem ?? "Histórico"} />}
              {isLegacy && <Field label="Setor original" value={(protocolo as any).__setor ?? protocolo.assunto ?? "—"} />}
              <Field label="Solicitante" value={protocolo.solicitante ?? "—"} />
            </div>
            {(protocolo as any).resolucao && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <div className="text-muted-foreground mb-1 font-medium">Resolução (último despacho)</div>
                <p className="whitespace-pre-wrap">{(protocolo as any).resolucao}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field2 label="Número interno">
                <Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} />
              </Field2>
              {form.tipo === "esic" && (
                <Field2 label="Número do pedido e-SIC *">
                  <Input value={form.numero_esic ?? ""} onChange={e => setForm({ ...form, numero_esic: e.target.value })} placeholder="Ex.: 0.092/2026" onBlur={e => setForm({ ...form, numero_esic: formatarNumeroEsic(e.target.value) })} />
                </Field2>
              )}
              {form.tipo === "esic" && form.prorrogado && (
                <Field2 label="Justificativa da prorrogação e-SIC">
                  <Textarea value={form.esic_prorrogacao_justificativa ?? ""} onChange={e => setForm({ ...form, esic_prorrogacao_justificativa: e.target.value })} rows={3} />
                </Field2>
              )}
              <Field2 label="Tipo">
                <Select value={form.tipo} onValueChange={(v) => setForm({
                  ...form,
                  tipo: v,
                  categoria: v === "esic" ? "esic" : form.categoria === "esic" ? "pedido_informacao" : form.categoria,
                })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
                    <SelectItem value="esic">e-SIC</SelectItem>
                  </SelectContent>
                </Select>
              </Field2>
              <Field2 label="Categoria">
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })} disabled={form.tipo === "esic"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.filter(c => form.tipo === "esic" ? c.value === "esic" : c.value !== "esic").map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="font-mono mr-2">{c.sigla}</span>{c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field2>
              <Field2 label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </Field2>
            </div>
            <Field2 label="Assunto">
              <Input value={form.assunto} onChange={e => setForm({ ...form, assunto: e.target.value })} />
            </Field2>
            <Field2 label={protocolo.triagem_pendente ? "Descrição (breve relato) *" : "Descrição"}>
              <Textarea
                rows={4}
                value={form.descricao}
                onChange={e => setForm({ ...form, descricao: e.target.value })}
                placeholder={protocolo.triagem_pendente ? "Descreva brevemente o relato desta manifestação para a secretaria responsável." : undefined}
                className={protocolo.triagem_pendente && !form.descricao.trim() ? "border-amber-500 focus-visible:ring-amber-500" : undefined}
              />
              {protocolo.triagem_pendente && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Obrigatório para concluir a triagem.
                </p>
              )}
            </Field2>
            {isObras && (
              <Field2 label={protocolo.triagem_pendente ? "Endereço da ocorrência *" : "Endereço da ocorrência"}>
                <div className="space-y-2">
                  <AddressAutocomplete
                    value={form.endereco ?? ""}
                    onChange={(value) =>
                      setForm({
                        ...form,
                        endereco: value,
                        latitude: null,
                        longitude: null,
                      })
                    }
                    onSelect={(result) =>
                      setForm({
                        ...form,
                        endereco: result.label,
                        latitude: result.lat,
                        longitude: result.lng,
                      })
                    }
                    placeholder="Digite a rua e selecione uma sugestão…"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setMapPickerOpen(true)}>
                      <MapPin className="mr-1.5 h-4 w-4" /> Marcar ponto no mapa
                    </Button>
                    {form.latitude != null && form.longitude != null ? (
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">
                        Ponto definido ({Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)})
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nenhum ponto definido</span>
                    )}
                  </div>
                  {protocolo.triagem_pendente && (
                    <p className="text-[11px] text-muted-foreground">
                      Obrigatório para concluir a triagem e exibir o protocolo no mapa de Obras.
                    </p>
                  )}
                </div>
              </Field2>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field2 label="Solicitante">
                <Input value={form.solicitante} onChange={e => setForm({ ...form, solicitante: e.target.value })} />
              </Field2>
              <Field2 label="Data de abertura">
                <Input type="date" value={form.data_abertura} onChange={e => setForm({ ...form, data_abertura: e.target.value })} />
              </Field2>
              <Field2 label="Secretaria">
                <Select value={form.secretaria_id || "none"} onValueChange={(v) => setForm({ ...form, secretaria_id: v === "none" ? "" : v, local_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {secretarias.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field2>
              <Field2 label="Local">
                <Select value={form.local_id || "none"} onValueChange={(v) => setForm({ ...form, local_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {locaisFiltrados.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field2>
              <Field2 label="Data conclusão">
                <Input type="date" value={form.data_conclusao ?? ""} onChange={e => setForm({ ...form, data_conclusao: e.target.value })} />
              </Field2>
            </div>
            <DialogFooter className="gap-2" />
          </div>
        )}
          </TabsContent>
          <TabsContent value="historico">
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {historico.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma alteração registrada ainda.</p>
              )}
              {historico.map((h: any) => (
                <div key={h.id} className="border rounded-md p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {h.acao === "create" ? "Criação" : h.campo.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{h.autor_nome ?? "Sistema"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {h.acao !== "create" && (
                    <div className="text-xs grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">De: </span>
                        <span className="line-through">{h.valor_anterior ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Para: </span>
                        <span className="font-medium">{h.valor_novo ?? "—"}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {(() => {
          const isLegacyFooter =
            protocolo?.__antigo === true ||
            protocolo?.detalhes?.legacy === true ||
            (typeof protocolo?.origem === "string" && protocolo.origem.startsWith("antigo:"));
          if (!urlValida1doc(protocolo?.url) && isLegacyFooter) {
            return (
              <DialogFooter className="border-t pt-3">
                <div className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Badge variant="outline" className="mr-2 border-slate-300 bg-white text-slate-600">
                    Protocolo legado
                  </Badge>
                  Link do 1Doc não disponível para este protocolo (importado do histórico).
                </div>
              </DialogFooter>
            );
          }
          return null;
        })()}
      </DialogContent>
    </Dialog>

    <MapPointPicker
      open={mapPickerOpen}
      onOpenChange={setMapPickerOpen}
      initial={form.latitude != null && form.longitude != null
        ? { lat: Number(form.latitude), lng: Number(form.longitude) }
        : null}
      endereco={form.endereco ?? ""}
      protocoloContext={{
        assunto: form.assunto,
        descricao: form.descricao,
        endereco: form.endereco,
        secretaria: secretariaSelecionada.nome,
        local: locais.find((local) => local.id === form.local_id)?.nome,
        categoria: form.categoria,
      }}
      onConfirm={(lat, lng, endereco) => {
        setForm({
          ...form,
          latitude: lat,
          longitude: lng,
          endereco: String(form.endereco ?? "").trim() || endereco || "",
        });
        toast.success("Ponto definido no mapa.");
      }}
    />

    <AlertDialog open={concluirOpen} onOpenChange={setConcluirOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Concluir protocolo</AlertDialogTitle>
          <AlertDialogDescription>
            Informe a data real da conclusão. Isso garante que os relatórios e a evolução de atrasados considerem o momento correto — mesmo que você registre a conclusão depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Data de conclusão</Label>
          <Input
            type="date"
            value={concluirData}
            max={new Date().toISOString().slice(0, 10)}
            min={protocolo?.data_abertura ?? undefined}
            onChange={(e) => setConcluirData(e.target.value)}
          />
          {protocolo?.data_abertura && (
            <p className="text-[11px] text-muted-foreground">
              Abertura: {formatDate(protocolo.data_abertura)}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={update.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarConclusao(); }} disabled={update.isPending}>
            Confirmar conclusão
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={prorrogarOpen} onOpenChange={setProrrogarOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Prorrogar prazo do e-SIC</AlertDialogTitle>
          <AlertDialogDescription>
            O prazo passa de 20 para 30 dias. Registre a justificativa expressa da prorrogação; ela ficará vinculada ao pedido.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="esic-prorrogacao-justificativa">Justificativa *</Label>
          <Textarea
            id="esic-prorrogacao-justificativa"
            rows={4}
            value={esicJustificativa}
            onChange={e => setEsicJustificativa(e.target.value)}
            placeholder="Explique o motivo concreto que impede a resposta dentro do prazo inicial."
          />
          <p className="text-[11px] text-muted-foreground">Mínimo de 20 caracteres. A aplicação registra a data e a justificativa.</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={update.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => { e.preventDefault(); confirmarProrrogacaoEsic(); }}
            disabled={update.isPending}
          >
            Confirmar prorrogação
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </TooltipProvider>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Field2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
