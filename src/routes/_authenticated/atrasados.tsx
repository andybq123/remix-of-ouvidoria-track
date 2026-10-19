import { termosBusca, matchProtocolo } from "@/lib/search-protocolos";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { situacaoProtocolo, estavaAtrasadoNaData, endOfMonthOrNow, formatDate, PRAZOS, categoriaLabel, categoriaSigla, categoriaBadgeClass, categoriaDoProtocolo, type TipoProtocolo } from "@/lib/prazo";
import { currentMonthValue, monthOptionsFromDates, formatMonthLabel } from "@/lib/month-filter";
import { AlertTriangle, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { BulkConcluirDialog } from "@/components/bulk-concluir-dialog";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { CheckCheck } from "lucide-react";
import { OnedocAgentButton } from "@/components/onedoc-agent-button";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/atrasados")({
  head: () => ({ meta: [
    { title: "Protocolos atrasados | OuviDesk" },
    { name: "description", content: "Protocolos atrasados no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Protocolos atrasados | OuviDesk" },
    { property: "og:description", content: "Protocolos atrasados no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AtrasadosPage,
});

function AtrasadosPage() {
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroSec, setFiltroSec] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [mes, setMes] = useState<string>(currentMonthValue());
  const [bulkOpen, setBulkOpen] = useState(false);
  const isAdmin = useIsAdmin();

  const { data: protocolos = [] } = useQuery({
    queryKey: ["protocolos"],
    queryFn: () =>
      fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("*, secretarias(nome, sigla), locais(nome)")
          .eq("triagem_pendente", false)
          .order("data_abertura", { ascending: false })
          .range(from, to),
      ),
  });

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("*").order("nome")).data ?? [],
  });

  const refDate = useMemo(
    () => (mes === "all" ? new Date() : endOfMonthOrNow(mes)),
    [mes],
  );

  const atrasados = useMemo(() => {
    return protocolos
      .map(p => {
        const r = estavaAtrasadoNaData(p as any, refDate);
        return { ...p, _s: situacaoProtocolo(p as any), _atraso: r };
      })
      .filter(p => p._atraso.atrasado)
      .filter(p => filtroTipo === "todos" || p.tipo === filtroTipo)
      .filter(p => filtroSec === "todos" || p.secretaria_id === filtroSec)
      .filter(p => {
        return matchProtocolo(p, termosBusca(busca));
      })
      .sort(sortProtocolosPorNumero);
  }, [protocolos, filtroTipo, filtroSec, busca, refDate]);

  const opcoesMes = useMemo(
    () => monthOptionsFromDates(protocolos.map(p => p.data_abertura)),
    [protocolos],
  );

  const buckets = {
    "+30 dias": atrasados.filter(p => p._atraso.diasAtraso > 30).length,
    "+20 dias": atrasados.filter(p => p._atraso.diasAtraso > 20 && p._atraso.diasAtraso <= 30).length,
    "+10 dias": atrasados.filter(p => p._atraso.diasAtraso > 10 && p._atraso.diasAtraso <= 20).length,
    "Até 10 dias": atrasados.filter(p => p._atraso.diasAtraso <= 10).length,
  };

  const timeline = useMemo(() => {
    if (protocolos.length === 0) return [] as { mes: string; label: string; total: number }[];
    const filtrados = protocolos
      .filter(p => filtroTipo === "todos" || p.tipo === filtroTipo)
      .filter(p => filtroSec === "todos" || p.secretaria_id === filtroSec);
    const datas = filtrados.map(p => p.data_abertura).filter(Boolean) as string[];
    if (datas.length === 0) return [];
    const minYM = datas.reduce((a, b) => (a < b ? a : b)).slice(0, 7);
    const maxYM = mes === "all" ? currentMonthValue() : mes;
    const [minY, minM] = minYM.split("-").map(Number);
    const [maxY, maxM] = maxYM.split("-").map(Number);
    const points: { mes: string; label: string; total: number }[] = [];
    let y = minY, m = minM;
    while (y < maxY || (y === maxY && m <= maxM)) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const ref = endOfMonthOrNow(ym);
      const total = filtrados.reduce(
        (acc, p) => acc + (estavaAtrasadoNaData(p as any, ref).atrasado ? 1 : 0),
        0,
      );
      points.push({ mes: ym, label: formatMonthLabel(ym), total });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return points;
  }, [protocolos, filtroTipo, filtroSec, mes]);

  function exportar() {
    const rows = atrasados.map(p => ({
      "Número": p.numero,
      "Número e-SIC": p.numero_esic ?? "",
      "Tipo": PRAZOS[p.tipo as TipoProtocolo].label,
      "Categoria": categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria)),
      "Data Abertura": formatDate(p.data_abertura),
      "Prazo Final": formatDate(p._atraso.prazoFinal),
      "Dias em atraso": p._atraso.diasAtraso,
      "Status": p.status,
      "Prorrogado": p.prorrogado ? "Sim" : "Não",
      "Secretaria": (p as any).secretarias?.nome ?? "",
      "Local": (p as any).locais?.nome ?? "",
      "Solicitante": p.solicitante ?? "",
      "Assunto": p.assunto,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atrasados");
    XLSX.writeFile(wb, `protocolos-atrasados-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" /> Protocolos atrasados
          </h1>
          <p className="text-sm text-muted-foreground">
            {atrasados.length} acumulados até {mes === "all" ? "hoje" : formatMonthLabel(mes)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value="all">Até hoje</SelectItem>
              {opcoesMes.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button onClick={() => setBulkOpen(true)} variant="default">
              <CheckCheck className="h-4 w-4 mr-1" /> Concluir em massa
            </Button>
          )}
          {isAdmin && <OnedocAgentButton tipo="lote" label="Atualizar todas pelo 1Doc" size="default" />}
          <Button onClick={exportar} variant="outline" disabled={atrasados.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(buckets).map(([label, value]) => (
          <Card key={label}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-destructive">{value}</p>
          </CardContent></Card>
        ))}
      </div>

      {timeline.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2">
              <p className="text-sm font-medium">Evolução do acumulado</p>
              <p className="text-xs text-muted-foreground">
                Fila de atrasados no fim de cada mês até {mes === "all" ? "hoje" : formatMonthLabel(mes)}
              </p>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="atrasadosGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 500 }}
                    formatter={(v: number) => [`${v} atrasados`, ""]}
                  />
                  <Area type="monotone" dataKey="total" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#atrasadosGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar…" value={busca} onChange={e => setBusca(e.target.value)} className="w-[240px]" />
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
            <SelectItem value="esic">e-SIC</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroSec} onValueChange={setFiltroSec}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as secretarias</SelectItem>
            {secretarias.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        {atrasados.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum protocolo em atraso. 🎉</CardContent></Card>
        )}
        {atrasados.map(p => {
          const dias = p._atraso.diasAtraso;
          const cls = dias > 30 ? "border-destructive bg-destructive/5" : dias > 20 ? "border-destructive/60" : dias > 10 ? "border-[var(--warning)]/60" : "";
          return (
            <Card
              key={p.id}
              className={`${cls} cursor-pointer hover:bg-accent/40 transition-colors`}
              onClick={() => setSelected(p)}
            >
              <CardContent className="p-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{p.numero}</span>
                    {p.tipo === "esic" && p.numero_esic && <Badge variant="outline" className="border-teal-600 text-teal-800 dark:text-teal-300 text-[10px]">Nº e-SIC {p.numero_esic}</Badge>}
                    <Badge variant="outline" className="text-[10px] uppercase">{PRAZOS[p.tipo as TipoProtocolo]?.label ?? p.tipo}</Badge>
                    <Badge
                      className={`text-[10px] ${categoriaBadgeClass(categoriaDoProtocolo(p.tipo, p.categoria))}`}
                      title={categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria))}
                    >
                      {categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria))}
                    </Badge>
                    {p.prorrogado && <Badge variant="outline" className="text-[10px]">prorrogado</Badge>}
                  </div>
                  <p className="text-sm font-medium mt-1 truncate">{p.assunto}</p>
                  <p className="text-xs text-muted-foreground">
                    {(p as any).secretarias?.nome ?? "—"} · Aberto {formatDate(p.data_abertura)} · Venceu {formatDate(p._atraso.prazoFinal)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-destructive leading-none">+{dias}d</p>
                  <p className="text-[10px] text-muted-foreground">atrasado</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ProtocoloDetailDialog
        protocolo={selected}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
      <BulkConcluirDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  );
}
