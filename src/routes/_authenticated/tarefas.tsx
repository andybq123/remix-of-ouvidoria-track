import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Inbox, Eye, CheckCheck, Lock, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { excluirProtocolos } from "@/lib/debug.functions";
import { toast } from "sonner";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";
import { formatDate, PRAZOS, categoriaLabel, categoriaBadgeClass, categoriaDoProtocolo, type TipoProtocolo } from "@/lib/prazo";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { mapDepartmentOf } from "@/lib/map-departments";

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: TarefasPage,
});

const LOCK_TTL_MS = 10 * 60 * 1000;
function isLockAtivo(p: any) {
  if (!p.triagem_lock_em || !p.triagem_lock_por) return false;
  return Date.now() - new Date(p.triagem_lock_em).getTime() < LOCK_TTL_MS;
}

const ASSUNTOS_SAUDE_TRIAGEM = new Set([
  "demora em marcar consulta / procedimento",
  "falta de materiais em posto de saude",
  "falta de medicacao",
  "medicos",
  "postos de saude",
  "transporte para tratamento",
  "vacinas",
]);
const normAssunto = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function MotivoTriagemBadge({ protocolo }: { protocolo: any }) {
  if (mapDepartmentOf(protocolo.secretarias ?? {}) === "obras") {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-800 dark:text-amber-300 bg-amber-500/10">
        Obras · informar endereço
      </Badge>
    );
  }
  if (!protocolo.secretaria_id) {
    return (
      <Badge variant="outline" className="text-[10px] border-rose-500/50 text-rose-700 dark:text-rose-300 bg-rose-500/10">
        sem secretaria identificada
      </Badge>
    );
  }
  if (ASSUNTOS_SAUDE_TRIAGEM.has(normAssunto(protocolo.assunto))) {
    return (
      <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
        Saúde · definir UBS/CAPS
      </Badge>
    );
  }
  return null;
}

function TarefasPage() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<any | null>(null);
  const [busca, setBusca] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchSec, setBatchSec] = useState<string>("");
  const [batchLocal, setBatchLocal] = useState<string>("");

  const { data: protocolos = [] } = useQuery({
    queryKey: ["protocolos-triagem"],
    queryFn: async () => {
      const rows = await fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("*, secretarias(nome, sigla), locais(nome), lock_profile:profiles!protocolos_triagem_lock_por_fkey(nome)")
          .eq("triagem_pendente", true)
          .order("data_abertura", { ascending: false })
          .range(from, to),
      );
      return [...rows].sort(sortProtocolosPorNumero);
    },
    refetchInterval: 30_000,
  });

  // Realtime: any change to a triagem row → refresh the queue
  useEffect(() => {
    const channel = supabase
      .channel("triagem-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "protocolos" }, () => {
        qc.invalidateQueries({ queryKey: ["protocolos-triagem"] });
        qc.invalidateQueries({ queryKey: ["triagem-stats"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  // Current user id, to decide which locks count as "outro usuário"
  const { data: meId } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: Infinity,
  });

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("*").order("nome")).data ?? [],
  });
  const { data: locais = [] } = useQuery({
    queryKey: ["locais"],
    queryFn: async () => (await supabase.from("locais").select("*").order("nome")).data ?? [],
  });

  const filtrados = protocolos.filter((p: any) => {
    if (!busca) return true;
    const s = busca.toLowerCase();
    return `${p.numero} ${p.numero_esic ?? ""} ${p.tipo === "esic" ? "e-SIC acesso à informação" : ""} ${p.assunto} ${p.solicitante ?? ""}`.toLowerCase().includes(s);
  });

  // Items that are locked by someone else are not selectable in batch
  const selecionaveis = filtrados.filter((p: any) => !(isLockAtivo(p) && p.triagem_lock_por !== meId));

  const locaisFiltrados = (locais as any[]).filter((l) => !batchSec || l.secretaria_id === batchSec);

  const batchMut = useMutation({
    mutationFn: async () => {
      if (!batchSec) throw new Error("Selecione a secretaria");
      if (selected.size === 0) throw new Error("Selecione ao menos um protocolo");
      if (mapDepartmentOf(secretarias.find((s) => s.id === batchSec) ?? {}) === "obras") {
        const incompletos = protocolos
          .filter((p) => selected.has(p.id))
          .filter((p) => !String(p.endereco ?? "").trim() || p.latitude == null || p.longitude == null);
        if (incompletos.length) {
          throw new Error("Protocolos de Obras precisam de endereço e ponto no mapa. Abra cada protocolo na triagem para preencher esses campos antes de concluir.");
        }
      }
      let ok = 0;
      const conflitos: string[] = [];
      for (const id of Array.from(selected)) {
        const { data, error } = await supabase.rpc("concluir_triagem", {
          p_id: id, p_secretaria: batchSec, p_local: batchLocal || (null as any),
        });
        if (error) { conflitos.push(`${id.slice(0,8)}: ${error.message}`); continue; }
        const r = data as any;
        if (r?.ok) ok++;
        else if (r?.motivo === "concluida") conflitos.push(`já concluída por ${r.por}`);
        else if (r?.motivo === "reservada") conflitos.push(`reservada por ${r.por}`);
        else conflitos.push(r?.motivo ?? "erro");
      }
      return { ok, conflitos };
    },
    onSuccess: ({ ok, conflitos }) => {
      if (ok > 0) toast.success(`${ok} protocolo(s) triados.`);
      if (conflitos.length > 0) toast.warning(`${conflitos.length} pulado(s): ${conflitos.slice(0,3).join("; ")}`);
      setSelected(new Set());
      setBatchSec("");
      setBatchLocal("");
      qc.invalidateQueries({ queryKey: ["protocolos-triagem"] });
      qc.invalidateQueries({ queryKey: ["protocolos"] });
      qc.invalidateQueries({ queryKey: ["triagem-stats"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao triar em lote"),
  });

  const excluirFn = useServerFn(excluirProtocolos);
  const delMut = useMutation({
    mutationFn: async (ids: string[]) => excluirFn({ data: { ids } }),
    onSuccess: (r, ids) => {
      toast.success(`${r.excluidos} protocolo(s) excluído(s).`);
      setSelected((prev) => { const n = new Set(prev); ids.forEach((i) => n.delete(i)); return n; });
      qc.invalidateQueries({ queryKey: ["protocolos-triagem"] });
      qc.invalidateQueries({ queryKey: ["protocolos"] });
      qc.invalidateQueries({ queryKey: ["triagem-stats"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });
  function excluir(ids: string[], descricao: string) {
    if (!confirm(`Excluir definitivamente ${descricao}? O histórico também será apagado.`)) return;
    delMut.mutate(ids);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    if (selected.size === selecionaveis.length) setSelected(new Set());
    else setSelected(new Set(selecionaveis.map((p: any) => p.id)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6" /> Tarefas — Triagem
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtrados.length} ouvidoria(s) aguardando triagem. Defina secretaria/local e salve para enviar ao módulo correspondente.
          </p>
        </div>
        <Input placeholder="Buscar nº, assunto, solicitante…" value={busca} onChange={e => setBusca(e.target.value)} className="w-[280px]" />
      </div>

      {selected.size > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">{selected.size} selecionado(s)</Badge>
            <Select value={batchSec} onValueChange={(v) => { setBatchSec(v); setBatchLocal(""); }}>
              <SelectTrigger className="w-[240px]"><SelectValue placeholder="Secretaria…" /></SelectTrigger>
              <SelectContent>
                {(secretarias as any[]).map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={batchLocal || "none"} onValueChange={(v) => setBatchLocal(v === "none" ? "" : v)} disabled={!batchSec}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Local/Área (opcional)…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem local —</SelectItem>
                {locaisFiltrados.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => batchMut.mutate()} disabled={!batchSec || batchMut.isPending}>
              <CheckCheck className="h-4 w-4 mr-1" /> Concluir triagem em lote
            </Button>
            <Button size="sm" variant="destructive" disabled={delMut.isPending}
              onClick={() => excluir(Array.from(selected), `${selected.size} protocolo(s) selecionado(s)`)}>
              <Trash2 className="h-4 w-4 mr-1" /> Excluir selecionados
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
          </CardContent>
        </Card>
      )}

      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma ouvidoria aguardando triagem.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground pl-2 cursor-pointer">
            <Checkbox
              checked={selected.size > 0 && selected.size === filtrados.length}
              onCheckedChange={toggleAll}
            />
            Selecionar todos
          </label>
          {filtrados.map((p: any) => (
            <Card key={p.id} className={`hover:bg-accent/30 transition-colors ${isLockAtivo(p) && p.triagem_lock_por !== meId ? "opacity-70" : ""}`}>
              <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                <Checkbox
                  checked={selected.has(p.id)}
                  onCheckedChange={() => toggle(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={isLockAtivo(p) && p.triagem_lock_por !== meId}
                />
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{p.numero}</span>
                    {p.tipo === "esic" && p.numero_esic && (
                      <Badge variant="outline" className="border-teal-600 text-teal-800 dark:text-teal-300 text-[10px]">Nº e-SIC {p.numero_esic}</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] uppercase">{PRAZOS[p.tipo as TipoProtocolo].label}</Badge>
                    <Badge className={`text-[10px] ${categoriaBadgeClass(categoriaDoProtocolo(p.tipo, p.categoria))}`}>
                      {categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria))}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-300 bg-amber-500/10">
                      triagem pendente
                    </Badge>
                    <MotivoTriagemBadge protocolo={p} />
                    {isLockAtivo(p) && (
                      <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-700 dark:text-blue-300 bg-blue-500/10 gap-1">
                        <Lock className="h-3 w-3" />
                        {p.triagem_lock_por === meId ? "você está triando" : `em triagem por ${p.lock_profile?.nome ?? "outro usuário"}`}
                      </Badge>
                    )}
                  </div>
                  <div className="font-medium text-sm">{p.assunto}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Aberto em {formatDate(p.data_abertura)} · {p.solicitante ?? "Solicitante não informado"}
                  </div>
                </div>
                <Button size="sm" onClick={() => setDetail(p)} variant={isLockAtivo(p) && p.triagem_lock_por !== meId ? "outline" : "default"}>
                  <Eye className="h-4 w-4 mr-1" />
                  {isLockAtivo(p) && p.triagem_lock_por !== meId ? "Visualizar" : "Triar"}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  aria-label={`Excluir protocolo ${p.numero}`} title="Excluir protocolo"
                  disabled={delMut.isPending}
                  onClick={() => excluir([p.id], `o protocolo ${p.numero}`)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProtocoloDetailDialog
        protocolo={detail}
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
          qc.invalidateQueries({ queryKey: ["protocolos-triagem"] });
          qc.invalidateQueries({ queryKey: ["protocolos"] });
          qc.invalidateQueries({ queryKey: ["triagem-stats"] });
        }}
      />
    </div>
  );
}
