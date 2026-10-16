import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { CATEGORIAS, situacaoProtocolo, formatDate, categoriaLabel, categoriaDoProtocolo, PRAZOS, type TipoProtocolo } from "@/lib/prazo";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";

export const Route = createFileRoute("/_authenticated/relatorios/secretaria/$id")({
  head: () => ({ meta: [
    { title: "Relatório da secretaria | OuviDesk" },
    { name: "description", content: "Relatório da secretaria no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Relatório da secretaria | OuviDesk" },
    { property: "og:description", content: "Relatório da secretaria no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SecretariaRelatorio,
});

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function SecretariaRelatorio() {
  const { id } = Route.useParams();
  const printRef = useRef<HTMLDivElement>(null);
  const [mes, setMes] = useState<string>("all");
  const [ano, setAno] = useState<string>(String(new Date().getFullYear()));
  const [localId, setLocalId] = useState<string>("all");

  const { data: secretaria } = useQuery({
    queryKey: ["secretaria", id],
    queryFn: async () => (await supabase.from("secretarias").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: protocolosAll = [] } = useQuery({
    queryKey: ["protocolos-sec", id],
    queryFn: () =>
      fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("*")
          .eq("secretaria_id", id)
          .order("data_abertura", { ascending: false })
          .range(from, to),
      ),
  });

  const { data: locais = [] } = useQuery({
    queryKey: ["locais-sec", id],
    queryFn: async () => (await supabase.from("locais").select("id,nome").eq("secretaria_id", id)).data ?? [],
  });

  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>([String(new Date().getFullYear())]);
    protocolosAll.forEach(p => set.add(p.data_abertura.slice(0, 4)));
    return Array.from(set).sort().reverse();
  }, [protocolosAll]);

  const protocolos = useMemo(() => protocolosAll.filter(p => {
    if (!p.data_abertura.startsWith(ano)) return false;
    if (mes !== "all" && p.data_abertura.slice(5, 7) !== mes) return false;
    if (localId !== "all") {
      if (localId === "__sem__") {
        if ((p as any).local_id) return false;
      } else if ((p as any).local_id !== localId) return false;
    }
    return true;
  }).sort(sortProtocolosPorNumero), [protocolosAll, ano, mes, localId]);

  const localSelecionado = useMemo(() => {
    if (localId === "all") return null;
    if (localId === "__sem__") return { id: "__sem__", nome: "Sem unidade" };
    return (locais as any[]).find(l => l.id === localId) ?? null;
  }, [localId, locais]);

  // Estatísticas exclusivas da unidade selecionada
  const unidadeDetalhe = useMemo(() => {
    if (!localSelecionado) return null;
    // Evolução dos últimos 12 meses (independente do filtro de mês/ano)
    const base = protocolosAll.filter(p => {
      if (localSelecionado.id === "__sem__") return !(p as any).local_id;
      return (p as any).local_id === localSelecionado.id;
    });
    const evolucao: { mes: string; total: number; concluidos: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const naquele = base.filter(p => p.data_abertura.startsWith(key));
      evolucao.push({
        mes: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        total: naquele.length,
        concluidos: naquele.filter(p => p.status === "concluido").length,
      });
    }
    // Top assuntos no período filtrado
    const assuntoCounts = new Map<string, number>();
    protocolos.forEach(p => {
      const a = (p.assunto ?? "—").trim() || "—";
      assuntoCounts.set(a, (assuntoCounts.get(a) ?? 0) + 1);
    });
    const topAssuntos = Array.from(assuntoCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    // Tempo médio de conclusão (em dias) no período filtrado
    const concluidosComData = protocolos.filter(p => p.status === "concluido" && p.data_conclusao);
    const tempoMedio = concluidosComData.length
      ? Math.round(
          concluidosComData.reduce((s, p: any) => {
            const ini = new Date(p.data_abertura + "T00:00:00").getTime();
            const fim = new Date(p.data_conclusao + "T00:00:00").getTime();
            return s + Math.max(0, (fim - ini) / (1000 * 60 * 60 * 24));
          }, 0) / concluidosComData.length,
        )
      : null;
    return { evolucao, topAssuntos, tempoMedio, totalHistorico: base.length };
  }, [localSelecionado, protocolosAll, protocolos]);

  const stats = useMemo(() => {
    const enriched = protocolos.map(p => ({ ...p, _s: situacaoProtocolo(p as any) }));
    const total = enriched.length;
    const concluidos = enriched.filter(p => p.status === "concluido").length;
    const abertos = total - concluidos;
    const vencidos = enriched.filter(p => p.status !== "concluido" && p._s.situacao === "vencido").length;
    const noPrazo = enriched.filter(p => p.status !== "concluido" && p._s.situacao !== "vencido").length;
    return { total, concluidos, abertos, vencidos, noPrazo, enriched };
  }, [protocolos]);

  const categoriaData = useMemo(() =>
    CATEGORIAS.map(c => ({
      name: c.label,
      value: protocolos.filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === c.value).length,
    })).filter(d => d.value > 0)
  , [protocolos]);

  const tipoData = useMemo(() => {
    const counts: Record<string, number> = {};
    protocolos.forEach(p => { counts[p.tipo] = (counts[p.tipo] || 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ name: PRAZOS[k as TipoProtocolo]?.label ?? k, value: v }));
  }, [protocolos]);

  const localData = useMemo(() => {
    const map = new Map(locais.map((l: any) => [l.id, l.nome]));
    const counts: Record<string, number> = {};
    protocolos.forEach(p => {
      const nome = (p as any).local_id ? (map.get((p as any).local_id) ?? "—") : "Sem unidade";
      counts[nome] = (counts[nome] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [protocolos, locais]);

  const topLocalData = useMemo(() => localData.slice(0, 10), [localData]);
  const localTotal = useMemo(() => localData.reduce((s, d) => s + d.value, 0), [localData]);
  const shortenLocalName = (name: string) => {
    if (!name) return "—";
    const clean = name
      .replace(/^(UBS|ESF|CAPS|UPA|Hospital|Unidade B[aá]sica de Sa[uú]de|Centro de Sa[uú]de|Posto de Sa[uú]de)\s+/i, "")
      .trim();
    const base = clean.length ? clean : name;
    return base.length > 22 ? base.slice(0, 20).trimEnd() + "…" : base;
  };
  const localChartData = useMemo(() => {
    if (localData.length <= 9) return localData.map(d => ({ ...d, short: shortenLocalName(d.name) }));
    const top = localData.slice(0, 8);
    const rest = localData.slice(8);
    const outrosVal = rest.reduce((s, d) => s + d.value, 0);
    return [
      ...top.map(d => ({ ...d, short: shortenLocalName(d.name) })),
      { name: `Outros (${rest.length})`, short: `Outros (${rest.length})`, value: outrosVal },
    ];
  }, [localData]);
  const categoriaTotal = useMemo(() => categoriaData.reduce((s, d) => s + d.value, 0), [categoriaData]);

  const crossTab = useMemo(() => {
    const map = new Map(locais.map((l: any) => [l.id, l.nome]));
    const rows = CATEGORIAS.map(c => {
      const filtered = protocolos.filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === c.value);
      const porLocal: Record<string, number> = {};
      let concluidos = 0, abertos = 0, vencidos = 0;
      filtered.forEach(p => {
        const nome = (p as any).local_id ? (map.get((p as any).local_id) ?? "—") : "Sem unidade";
        porLocal[nome] = (porLocal[nome] || 0) + 1;
        if (p.status === "concluido") concluidos++;
        else {
          abertos++;
          if (situacaoProtocolo(p as any).situacao === "vencido") vencidos++;
        }
      });
      return {
        categoria: c.label,
        total: filtered.length,
        concluidos,
        abertos,
        vencidos,
        unidades: Object.entries(porLocal).sort((a, b) => b[1] - a[1]),
      };
    }).filter(r => r.total > 0);
    return rows;
  }, [protocolos, locais]);

  const mensalData = useMemo(() => {
    const year = new Date().getFullYear();
    const counts = Array(12).fill(0);
    protocolos.forEach(p => {
      if (p.data_abertura.startsWith(String(year))) {
        counts[parseInt(p.data_abertura.slice(5, 7), 10) - 1]++;
      }
    });
    return MESES.map((m, i) => ({ mes: m, total: counts[i] }));
  }, [protocolos]);

  function exportPDF() {
    if (!secretaria) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Relatório — ${secretaria.nome}`, 40, 50);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let y = 70;
    if (secretaria.sigla) { doc.text(`Sigla: ${secretaria.sigla}`, 40, y); y += 14; }
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 40, y); y += 20;

    // Resumo
    autoTable(doc, {
      startY: y,
      head: [["Total", "Abertos", "Concluídos", "Vencidos", "No prazo"]],
      body: [[stats.total, stats.abertos, stats.concluidos, stats.vencidos, stats.noPrazo].map(String)],
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Por categoria
    autoTable(doc, {
      head: [["Categoria", "Quantidade"]],
      body: categoriaData.map(c => [c.name, String(c.value)]),
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
    });

    // Por tipo
    autoTable(doc, {
      head: [["Tipo", "Quantidade"]],
      body: tipoData.map(t => [t.name, String(t.value)]),
      theme: "striped",
      headStyles: { fillColor: [139, 92, 246] },
    });

    // Protocolos
    autoTable(doc, {
      head: [["Nº", "Nº e-SIC", "Data", "Tipo", "Categoria", "Assunto", "Status", "Situação"]],
      body: stats.enriched.map(p => [
        p.numero,
        p.numero_esic ?? "",
        formatDate(p.data_abertura),
        PRAZOS[p.tipo as TipoProtocolo]?.label ?? p.tipo,
        categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria)),
        (p.assunto ?? "").slice(0, 50),
        p.status,
        p.status === "concluido" ? "Concluído" : (p._s.situacao === "vencido" ? `Atrasado ${Math.abs(p._s.dias)}d` : `${p._s.dias}d restantes`),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [239, 68, 68] },
    });

    doc.save(`relatorio-${secretaria.nome.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  if (!secretaria) {
    return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/relatorios"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{secretaria.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {secretaria.sigla && <span className="mr-2">{secretaria.sigla}</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ano inteiro</SelectItem>
              {MESES_FULL.map((m, i) => (
                <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          {locais.length > 0 && (
            <Select value={localId} onValueChange={setLocalId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="all">Todas as unidades</SelectItem>
                <SelectItem value="__sem__">Sem unidade</SelectItem>
                {(locais as any[]).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={exportPDF}>
            <FileText className="h-4 w-4 mr-1" /> Exportar PDF
          </Button>
        </div>
      </div>

      <div ref={printRef} className="space-y-4">
        {localSelecionado && unidadeDetalhe && (
          <Card className="border-emerald-500/40">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Relatório detalhado — {localSelecionado.nome}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Período filtrado: {mes === "all" ? `Ano ${ano}` : `${MESES_FULL[parseInt(mes, 10) - 1]}/${ano}`} · Histórico total: {unidadeDetalhe.totalHistorico} protocolo(s)
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setLocalId("all")}>Limpar unidade</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Total no período</div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Concluídos</div>
                  <div className="text-2xl font-bold text-green-600">{stats.concluidos}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Vencidos</div>
                  <div className="text-2xl font-bold text-destructive">{stats.vencidos}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Tempo médio conclusão</div>
                  <div className="text-2xl font-bold">
                    {unidadeDetalhe.tempoMedio === null ? "—" : `${unidadeDetalhe.tempoMedio}d`}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium mb-2">Evolução (últimos 12 meses)</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={unidadeDetalhe.evolucao}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="mes" className="text-xs" />
                      <YAxis allowDecimals={false} className="text-xs" />
                      <Tooltip content={<ChartTooltipContent unit="protocolos" />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
                      <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                      <Bar dataKey="total" name="Abertos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="concluidos" name="Concluídos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Top assuntos no período</div>
                  {unidadeDetalhe.topAssuntos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm max-h-[240px] overflow-y-auto pr-1">
                      {unidadeDetalhe.topAssuntos.map((a, i) => (
                        <li key={a.name} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span className="flex-1 truncate" title={a.name}>{a.name}</span>
                          <Badge variant="outline" className="text-xs">{a.value}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Abertos", value: stats.abertos, color: "text-blue-600" },
            { label: "Concluídos", value: stats.concluidos, color: "text-green-600" },
            { label: "Vencidos", value: stats.vencidos, color: "text-destructive" },
            { label: "No prazo", value: stats.noPrazo, color: "text-amber-600" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Por categoria</CardTitle></CardHeader>
            <CardContent>
              {categoriaData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
              ) : (
                <div className="relative">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={categoriaData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={125}
                      minAngle={6}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                      labelLine={false}
                      label={({ percent }: any) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                    >
                      {categoriaData.map((d, i) => (
                        <Cell key={i} fill={d.name === "Pedido e-SIC" ? "#0f766e" : COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltipContent unit="protocolos" total={categoriaTotal} />} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      formatter={(value: string) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -mt-8">
                  <span className="text-2xl font-bold tabular-nums">{categoriaTotal}</span>
                  <span className="text-[11px] text-muted-foreground">protocolos</span>
                </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Por unidade</CardTitle></CardHeader>
            <CardContent>
              {localData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
              ) : (
                <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <Pie
                          data={localChartData}
                          dataKey="value"
                          nameKey="short"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={110}
                          minAngle={4}
                          paddingAngle={2}
                          stroke="#ffffff"
                          strokeWidth={2}
                          labelLine={false}
                          label={({ percent }: any) => percent > 0.07 ? `${(percent * 100).toFixed(0)}%` : ""}
                        >
                          {localChartData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltipContent unit="protocolos" total={localTotal} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold tabular-nums">{localTotal}</span>
                      <span className="text-[11px] text-muted-foreground">protocolos</span>
                    </div>
                  </div>
                  <ul className="max-h-[280px] overflow-y-auto pr-1 space-y-1.5 text-xs min-w-[140px] max-w-[200px]">
                    {localChartData.map((d, i) => (
                      <li key={d.name} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="truncate flex-1" title={d.name}>{d.short}</span>
                        <span className="tabular-nums text-muted-foreground">{d.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {topLocalData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ranking de unidades{mes !== "all" ? ` — ${MESES_FULL[parseInt(mes, 10) - 1]}/${ano}` : ` — ${ano}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, topLocalData.length * 36)}>
                <BarChart data={topLocalData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} className="text-xs" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={180}
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />
                  <Tooltip content={<ChartTooltipContent unit="protocolos" total={localTotal} />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11 }}>
                    {topLocalData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Manifestações por tipo × unidade</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/40 text-left">
                  <th className="py-2 px-3 font-medium">Tipo</th>
                  <th className="py-2 px-2 font-medium text-xs text-center">Total</th>
                  <th className="py-2 px-2 font-medium text-xs text-center">Concluídos</th>
                  <th className="py-2 px-2 font-medium text-xs text-center">Abertos</th>
                  <th className="py-2 px-2 font-medium text-xs text-center">Vencidos</th>
                  <th className="py-2 px-3 font-medium text-xs">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {crossTab.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sem dados</td></tr>
                )}
                {crossTab.map(row => (
                  <tr key={row.categoria} className="border-b hover:bg-secondary/30 align-top">
                    <td className="py-2 px-3 font-medium">{row.categoria}</td>
                    <td className="py-2 px-2 text-center">{row.total}</td>
                    <td className="py-2 px-2 text-center text-green-600">{row.concluidos}</td>
                    <td className="py-2 px-2 text-center text-blue-600">{row.abertos}</td>
                    <td className="py-2 px-2 text-center text-destructive">{row.vencidos}</td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.unidades.map(([nome, qtd]) => (
                          <Badge key={nome} variant="outline" className="text-xs">
                            {nome} · {qtd}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Protocolos por mês ({new Date().getFullYear()})</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mensalData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip content={<ChartTooltipContent unit="protocolos" />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Todos os protocolos ({stats.enriched.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/40 text-left">
                  <th className="py-2 px-3 font-medium">Nº / Assunto</th>
                  <th className="py-2 px-2 font-medium text-xs">Tipo</th>
                  <th className="py-2 px-2 font-medium text-xs">Categoria</th>
                  <th className="py-2 px-2 font-medium text-xs">Aberto</th>
                  <th className="py-2 px-2 font-medium text-xs">Status</th>
                  <th className="py-2 px-2 font-medium text-xs text-right">Situação</th>
                </tr>
              </thead>
              <tbody>
                {stats.enriched.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sem protocolos</td></tr>
                )}
                {stats.enriched.map(p => (
                  <tr key={p.id} className="border-b hover:bg-secondary/30">
                    <td className="py-2 px-3">
                      <div className="font-mono text-[10px] text-muted-foreground">{p.numero}</div>
                      {p.tipo === "esic" && p.numero_esic && <div className="font-mono text-[10px] text-teal-700 dark:text-teal-300">e-SIC {p.numero_esic}</div>}
                      <div>{p.assunto}</div>
                    </td>
                    <td className="py-2 px-2 text-xs">{PRAZOS[p.tipo as TipoProtocolo]?.label ?? p.tipo}</td>
                    <td className="py-2 px-2 text-xs">{categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria))}</td>
                    <td className="py-2 px-2 text-xs">{formatDate(p.data_abertura)}</td>
                    <td className="py-2 px-2 text-xs"><Badge variant="outline">{p.status}</Badge></td>
                    <td className="py-2 px-2 text-xs text-right">
                      {p.status === "concluido" ? (
                        <span className="text-green-600">Concluído</span>
                      ) : p._s.situacao === "vencido" ? (
                        <span className="text-destructive font-semibold">+{Math.abs(p._s.dias)}d</span>
                      ) : (
                        <span className="text-muted-foreground">{p._s.dias}d</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
