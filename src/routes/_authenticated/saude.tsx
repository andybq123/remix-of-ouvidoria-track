import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { situacaoProtocolo, formatDate, PRAZOS, categoriaLabel, categoriaSigla, categoriaBadgeClass, categoriaDoProtocolo, CATEGORIAS, type TipoProtocolo } from "@/lib/prazo";
import { HeartPulse } from "lucide-react";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";
import { termosBusca, matchProtocolo } from "@/lib/search-protocolos";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentMonthValue } from "@/lib/month-filter";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#14b8a6", "#a855f7", "#eab308"];

export const Route = createFileRoute("/_authenticated/saude")({
  component: SaudePage,
});

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
      .map(c => ({ name: c.label, value: saude.filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === c.value).length }))
      .filter(d => d.value > 0),
  [saude]);

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

  // Evolução de solicitações por mês — últimos 12 meses (Saúde)
  const evolucaoSaude = useMemo(() => {
    const meses: { mes: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const inicio = startOfMonth(subMonths(new Date(), i));
      const fim = startOfMonth(subMonths(new Date(), i - 1));
      const qtd = saude.filter(p => {
        const d = new Date(p.data_abertura);
        return d >= inicio && d < fim;
      }).length;
      meses.push({ mes: format(inicio, "MMM/yy", { locale: ptBR }), total: qtd });
    }
    return meses;
  }, [saude]);

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

      {saude.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Por unidade de saúde</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={porUnidade}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={120}
                    minAngle={4}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                    labelLine={false}
                    label={({ value }: any) => value}
                  >
                    {porUnidade.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent unit="protocolo(s)" />} />
                  <Legend verticalAlign="bottom" iconType="circle" formatter={(v: string) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Por tipo de manifestação</CardTitle></CardHeader>
            <CardContent>
              {porCategoria.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={porCategoria}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={120}
                      minAngle={6}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                      labelLine={false}
                      label={({ value, percent }: any) => `${value} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {porCategoria.map((d, i) => (
                        <Cell key={i} fill={d.name === "Pedido e-SIC" ? "#0f766e" : COLORS[(i + 3) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltipContent unit="protocolo(s)" />} />
                    <Legend verticalAlign="bottom" iconType="circle" formatter={(v: string) => <span className="text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
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
                <LineChart data={evolucaoSaude} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip content={<ChartTooltipContent unit="solicitação(ões)" />} cursor={{ stroke: "hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5}
                    dot={{ r: 4, fill: "#10b981" }}
                    label={{ position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                </LineChart>
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
