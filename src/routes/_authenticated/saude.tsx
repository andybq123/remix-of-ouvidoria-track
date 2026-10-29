import { useIsAdmin } from "@/hooks/use-is-admin";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSomenteVigilancia } from "@/hooks/use-somente-vigilancia";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { situacaoProtocolo, formatDate, PRAZOS, categoriaLabel, categoriaSigla, categoriaBadgeClass, categoriaDoProtocolo, CATEGORIAS, type TipoProtocolo } from "@/lib/prazo";
import { HeartPulse, Inbox, Activity, CheckCircle2, AlarmClock, AlertTriangle } from "lucide-react";
import { KpiCard, CAT_COLORS } from "@/components/kpi-card";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";
import { termosBusca, matchProtocolo } from "@/lib/search-protocolos";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentMonthValue } from "@/lib/month-filter";
import { validarFiltrosProtocolos } from "@/lib/protocolos-listagem";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { HealthUnitChart } from "@/components/health-unit-chart";
import { format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";


export const Route = createFileRoute("/_authenticated/saude")({
  head: () => ({ meta: [
    { title: "Saúde | OuviDesk" },
    { name: "description", content: "Saúde no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Saúde | OuviDesk" },
    { property: "og:description", content: "Saúde no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SaudeGuard,
});

function SaudeGuard() {
  const isAdmin = useIsAdmin();
  const soVigilancia = useSomenteVigilancia();
  if (soVigilancia && !isAdmin) {
    return <div className="py-10 text-center text-sm text-muted-foreground">
      Suas ouvidorias ficam na aba <Link to="/protocolos" search={validarFiltrosProtocolos({})} className="underline">Protocolos</Link>.
    </div>;
  }
  return <SaudePage />;
}

function SaudePage() {
  const [busca, setBusca] = useState("");
  const [unidade, setUnidade] = useState<string>("todas");
  const _cur = currentMonthValue();
  const [mes, setMes] = useState<string>(_cur.slice(5, 7));
  const [ano, setAno] = useState<string>(_cur.slice(0, 4));
  const [dataIni, setDataIni] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);

  const { data: saudeSec } = useQuery({
    queryKey: ["secretaria-saude"],
    queryFn: async () => {
      const { data } = await supabase.from("secretarias").select("id,nome").eq("nome", "Saúde").maybeSingle();
      return data;
    },
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ["locais-saude", saudeSec?.id],
    queryFn: async () => {
      const { data } = await supabase.from("locais").select("id,nome").eq("secretaria_id", saudeSec!.id).order("nome");
      return data ?? [];
    },
    enabled: !!saudeSec?.id,
  });

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

  const termos = termosBusca(busca);

  const saude = protocolos.filter(p => {
    if (!saudeSec?.id || (p as any).secretaria_id !== saudeSec.id) return false;
    if (unidade !== "todas" && (p as any).local_id !== unidade) return false;
    if (dataIni || dataFim) {
      if (dataIni && (p.data_abertura ?? "") < dataIni) return false;
      if (dataFim && (p.data_abertura ?? "") > dataFim) return false;
    } else if (termos.length === 0) {
      if (!p.data_abertura.startsWith(ano)) return false;
      if (mes !== "all" && p.data_abertura.slice(5, 7) !== mes) return false;
    }
    if (!matchProtocolo(p, termos)) return false;
    return true;
  }).sort(sortProtocolosPorNumero);


  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>([String(new Date().getFullYear())]);
    protocolos.forEach(p => set.add(p.data_abertura.slice(0, 4)));
    return Array.from(set).sort().reverse();
  }, [protocolos]);

  const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const porUnidade = useMemo(() => {
    const counts = new Map<string, number>();
    saude.forEach(p => {
      const nome = (p as any).locais?.nome ?? "Sem unidade";
      counts.set(nome, (counts.get(nome) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [saude]);

  const porCategoria = useMemo(() =>
    CATEGORIAS
      .map(c => ({ name: c.label, value: saude.filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === c.value).length, color: CAT_COLORS[c.value] }))
      .filter(d => d.value > 0),
  [saude]);

  const kpis = useMemo(() => {
    let concluidas = 0, atrasadas = 0, criticas = 0;
    saude.forEach(p => {
      const s = situacaoProtocolo(p as any).situacao;
      if (s === "concluido") concluidas++;
      else if (s === "vencido") atrasadas++;
      else if (s === "critico") criticas++;
    });
    return { total: saude.length, concluidas, atrasadas, criticas, andamento: saude.length - concluidas };
  }, [saude]);

  const porSituacao = useMemo(() => [
    { name: "Em andamento", value: kpis.andamento - kpis.atrasadas, color: "hsl(217 91% 60%)" },
    { name: "Concluídas", value: kpis.concluidas, color: "hsl(142 71% 45%)" },
    { name: "Atrasadas", value: kpis.atrasadas, color: "hsl(0 84% 60%)" },
  ].filter(d => d.value > 0), [kpis]);

  // Para cada categoria, contagem por unidade de saúde (usado no tooltip)
  const unidadesPorCategoria = useMemo(() => {
    const map: Record<string, { name: string; value: number }[]> = {};
    CATEGORIAS.forEach(c => {
      const counts = new Map<string, number>();
      saude
        .filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === c.value)
        .forEach(p => {
          const nome = (p as any).locais?.nome ?? "Sem unidade";
          counts.set(nome, (counts.get(nome) ?? 0) + 1);
        });
      map[c.label] = Array.from(counts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    });
    return map;
  }, [saude]);

  // Evolução de solicitações por mês — últimos 12 meses (Saúde), independente dos filtros de período/busca
  const evolucaoSaude = useMemo(() => {
    const counts = new Map<string, number>();
    protocolos.forEach(p => {
      if (!saudeSec?.id || (p as any).secretaria_id !== saudeSec.id) return;
      if (unidade !== "todas" && (p as any).local_id !== unidade) return;
      const chave = (p.data_abertura ?? "").slice(0, 7);
      counts.set(chave, (counts.get(chave) ?? 0) + 1);
    });
    const meses: { mes: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const inicio = startOfMonth(subMonths(new Date(), i));
      meses.push({ mes: format(inicio, "MMM/yy", { locale: ptBR }), total: counts.get(format(inicio, "yyyy-MM")) ?? 0 });
    }
    return meses;
  }, [protocolos, saudeSec?.id, unidade]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-emerald-500" /> Saúde
          </h1>
          <p className="text-sm text-muted-foreground">{saude.length} protocolo(s) da Secretaria de Saúde</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Buscar nº, assunto, relato, unidade…" value={busca} onChange={e => setBusca(e.target.value)} className="w-[280px]" />
        {termos.length > 0 && !dataIni && !dataFim && (
          <span className="text-xs text-muted-foreground">buscando em todo o período</span>
        )}

        <Select value={unidade} onValueChange={setUnidade}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Unidade de saúde" /></SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="todas">Todas as unidades</SelectItem>
            {unidades.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
          </SelectContent>
        </Select>
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
        <div className="flex items-center gap-1 ml-1">
          <span className="text-xs text-muted-foreground">De</span>
          <Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="w-[150px]" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-[150px]" />
          {(dataIni || dataFim) && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline ml-1" onClick={() => { setDataIni(""); setDataFim(""); }}>
              limpar
            </button>
          )}
        </div>
        {(dataIni || dataFim) && (
          <span className="text-xs text-muted-foreground">
            (período selecionado ignora o filtro de mês/ano)
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard icon={Inbox} label="Total no período" value={kpis.total} tone="primary" />
        <KpiCard icon={Activity} label="Em andamento" value={kpis.andamento} tone="violet" />
        <KpiCard icon={CheckCircle2} label="Concluídas" value={kpis.concluidas} tone="success"
          hint={kpis.total > 0 ? `${((kpis.concluidas / kpis.total) * 100).toFixed(1)}% do total` : undefined} />
        <KpiCard icon={AlarmClock} label="Vencendo em até 3 dias" value={kpis.criticas} tone="warning" />
        <KpiCard icon={AlertTriangle} label="Atrasadas" value={kpis.atrasadas} tone="destructive" />
      </div>

      {saude.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por unidade de saúde</CardTitle>
              <p className="text-[11px] text-muted-foreground">Distribuição por unidade</p>
            </CardHeader>
            <CardContent>
              <HealthUnitChart data={porUnidade} />
            </CardContent>
          </Card>
          <DonutCard titulo="Categorias" subtitulo="Distribuição das manifestações" dados={porCategoria} />
          <DonutCard titulo="Situação" subtitulo="Andamento dos prazos" dados={porSituacao} />
        </div>
      )}

      {saude.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manifestações por tipo × unidade de saúde</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/40 text-left">
                  <th className="py-2 px-3 font-medium">Tipo de manifestação</th>
                  <th className="py-2 px-3 font-medium text-right">Total</th>
                  <th className="py-2 px-3 font-medium">Unidades de saúde</th>
                </tr>
              </thead>
              <tbody>
                {porCategoria.map(c => {
                  const unidades = unidadesPorCategoria[c.name] ?? [];
                  return (
                    <tr key={c.name} className="border-b align-top">
                      <td className="py-2 px-3 font-medium">{c.name}</td>
                      <td className="py-2 px-3 text-right font-mono">{c.value}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {unidades.map(u => (
                            <Badge key={u.name} variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700">
                              {u.name} · {u.value}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {saude.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Evolução de solicitações (últimos 12 meses)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={evolucaoSaude} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="evolucaoSaudeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltipContent unit="solicitação(ões)" />} cursor={{ stroke: "var(--chart-2)", strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="total" stroke="var(--chart-2)" strokeWidth={3}
                    fill="url(#evolucaoSaudeGradient)"
                    animationDuration={1400} animationEasing="ease-out"
                    dot={{ r: 4.5, fill: "var(--chart-2)", stroke: "var(--background)", strokeWidth: 2 }}
                    activeDot={{ r: 7, stroke: "var(--background)", strokeWidth: 2.5 }}
                    label={{ position: "top", fontSize: 10, fill: "var(--muted-foreground)" }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {saude.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum protocolo da Saúde encontrado. Marque um protocolo definindo a Secretaria como "Saúde" e selecione a unidade no campo Local.</CardContent></Card>
        )}
        {saude.map(p => {
          const s = situacaoProtocolo(p as any);
          return (
            <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition" onClick={() => setDetail(p)}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{p.numero}</span>
                      {p.tipo === "esic" && p.numero_esic && <Badge variant="outline" className="border-teal-600 text-teal-800 dark:text-teal-300 text-[10px]">Nº e-SIC {p.numero_esic}</Badge>}
                      <Badge variant="outline" className="text-[10px] uppercase">{PRAZOS[p.tipo as TipoProtocolo].label}</Badge>
                      <Badge
                        className={`text-[10px] ${categoriaBadgeClass(categoriaDoProtocolo(p.tipo, p.categoria))}`}
                        title={categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria))}
                      >
                        {categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria))}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{p.status.replace("_", " ")}</Badge>
                      {(p as any).locais?.nome && (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">
                          {(p as any).locais.nome}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold mt-2">{p.assunto}</h3>
                    {p.descricao && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Aberto {formatDate(p.data_abertura)}</span>
                      <span>Prazo {formatDate(s.prazoFinal)}</span>
                      {(p as any).secretarias && <span>{(p as any).secretarias.nome}</span>}
                      {p.solicitante && <span>{p.solicitante}</span>}
                    </div>
                  </div>
                    <div className="shrink-0">
                    <Badge className={`text-[10px] border ${s.situacao === "vencido" ? "border-destructive bg-destructive/5 text-destructive" : s.situacao === "critico" ? "border-[var(--warning)] bg-[var(--warning)]/5 text-[var(--warning-foreground)]" : s.situacao === "atencao" ? "border-yellow-500 bg-yellow-500/5 text-yellow-600" : "border-emerald-500 bg-emerald-500/5 text-emerald-500"}`}>
                      {s.situacao === "vencido" ? "Atrasado" : s.situacao === "critico" ? "Crítico" : s.situacao === "atencao" ? "Atenção" : "Em dia"} · {s.dias < 0 ? `${Math.abs(s.dias)}d atrasado` : `${s.dias}d restantes`}
                    </Badge>
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

function DonutCard({ titulo, subtitulo, dados }: { titulo: string; subtitulo: string; dados: { name: string; value: number; color: string }[] }) {
  const total = dados.reduce((s, d) => s + d.value, 0);
  const vazio = [{ name: "—", value: 1, color: "hsl(var(--muted))" }];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{subtitulo}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={dados.length > 0 ? dados : vazio} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} animationDuration={900}>
                {(dados.length > 0 ? dados : vazio).map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltipContent unit="protocolo(s)" total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold">{total}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          {dados.map(d => (
            <div key={d.name} className="w-full flex items-center gap-2 text-xs px-1 py-0.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="font-medium">{d.name}</span>
              <span className="ml-auto text-muted-foreground">{total > 0 ? ((d.value / total) * 100).toFixed(1) : "0"}% ({d.value})</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
