import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { situacaoProtocolo, estavaAtrasadoNaData, endOfMonthOrNow, CATEGORIAS, calcularSla, resumoOperacional, categoriaDoProtocolo, type CategoriaProtocolo } from "@/lib/prazo";
import {
  AlertTriangle, CheckCircle2, Clock, FileText, Smile,
  Timer, Download, MapPin, TrendingUp, Lightbulb, Building, ShieldCheck, Activity,
  ArrowUpRight, ArrowDownRight, Users, ThumbsUp, ThumbsDown, AlertCircle, BarChart3,
} from "lucide-react";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";
import { ManifestacoesMap, type SecretariaPoint, type LocalPoint } from "@/components/manifestacoes-map";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Link, useNavigate } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { currentMonthValue, monthOptionsFromDates, isInMonth, formatMonthLabel } from "@/lib/month-filter";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { format, startOfMonth, subMonths, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRealtimeSync } from "@/hooks/realtime-sync-context";
import { MapDepartmentToggle } from "@/components/map-department-toggle";
import { mapDepartmentOf, matchesMapDepartment, type MapDepartmentScope } from "@/lib/map-departments";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Painel de gestão | Controle SETA" },
    { name: "description", content: "Indicadores, protocolos e mapas da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Painel de gestão | Controle SETA" },
    { property: "og:description", content: "Indicadores, protocolos e mapas da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

const CAT_COLORS: Record<CategoriaProtocolo, string> = {
  solicitacao: "hsl(217 91% 60%)",
  reclamacao: "hsl(25 95% 53%)",
  elogio: "hsl(142 71% 45%)",
  denuncia: "hsl(0 84% 60%)",
  pedido_informacao: "hsl(262 83% 58%)",
  esic: "hsl(174 72% 35%)",
  sugestao: "hsl(199 89% 48%)",
  outros: "hsl(215 16% 60%)",
};

function fmtDuracao(horas: number): string {
  if (!Number.isFinite(horas) || horas < 0) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${horas.toFixed(1)} h`;
  return `${Math.round(horas / 24)} dias`;
}

function Dashboard() {
  const navigate = useNavigate();
  const [drill, setDrill] = useState<{
    titleBase: string;
    predicate: (p: any) => boolean;
    source: "filtrados" | "all";
  } | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [mes, setMes] = useState<string>(currentMonthValue());
  const [mapScope, setMapScope] = useState<MapDepartmentScope>("saude");

  const { data: protocolos = [] } = useQuery({
    queryKey: ["protocolos"],
    queryFn: () =>
      fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("*, secretarias(nome, sigla, icone), locais(nome)")
          // O prazo e a contabilização e-SIC começam no recebimento, não na triagem.
          .or("triagem_pendente.eq.false,tipo.eq.esic")
          .order("data_abertura", { ascending: false })
          .range(from, to),
      ),
  });

  const { data: triagemStats } = useQuery({
    queryKey: ["triagem-stats"],
    queryFn: async () => {
      const { count: pendentes } = await supabase
        .from("protocolos")
        .select("id", { count: "exact", head: true })
        .eq("triagem_pendente", true);
      const desdeIso = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: concluidas } = await supabase
        .from("protocolos")
        .select("created_at, triagem_concluida_em")
        .not("triagem_concluida_em", "is", null)
        .gte("triagem_concluida_em", desdeIso);
      const horas = (concluidas ?? [])
        .map((r: any) => (new Date(r.triagem_concluida_em).getTime() - new Date(r.created_at).getTime()) / 3600000)
        .filter((h) => h >= 0 && Number.isFinite(h));
      const media = horas.length ? horas.reduce((a, b) => a + b, 0) / horas.length : 0;
      const { data: maisAntiga } = await supabase
        .from("protocolos")
        .select("created_at")
        .eq("triagem_pendente", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const esperaH = maisAntiga ? (Date.now() - new Date((maisAntiga as any).created_at).getTime()) / 3600000 : 0;
      return { pendentes: pendentes ?? 0, mediaHoras: media, esperaMaiorHoras: esperaH, amostra: horas.length };
    },
    refetchInterval: 60000,
  });

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("secretarias").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: locaisComCoord = [] } = useQuery({
    queryKey: ["locais-com-coordenadas"],
    queryFn: async () => (
      await supabase
        .from("locais")
        .select("id, nome, latitude, longitude, secretaria_id, secretarias(nome, sigla, icone)")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("nome")
    ).data ?? [],
  });

  const enriched = useMemo(
    () => protocolos.map(p => ({ ...p, _s: situacaoProtocolo(p as any) })),
    [protocolos],
  );

  // Antigos já estão no banco (origem 'antigo:*') — não fazer merge do JSON aqui.
  const allEnriched = useMemo(
    () => [...enriched].sort(sortProtocolosPorNumero),
    [enriched],
  );

  // Filtro de mês aplicado à maior parte das métricas. O gráfico
  // "Evolução por mês" continua usando todos os protocolos (precisa do histórico).
  const filtrados = useMemo(
    () => (mes === "all" ? allEnriched : allEnriched.filter(p => isInMonth(p.data_abertura, mes))),
    [allEnriched, mes],
  );
  const mapSecretarias = useMemo(
    () => (secretarias as any[]).filter((s) => mapDepartmentOf(s) !== null && matchesMapDepartment(s, mapScope)),
    [secretarias, mapScope],
  );
  const mapDepartmentIds = useMemo(
    () => new Set(mapSecretarias.map((s: any) => s.id)),
    [mapSecretarias],
  );
  const mapLocais = useMemo(
    () => (locaisComCoord as any[]).filter((l) => mapDepartmentIds.has(l.secretaria_id)),
    [locaisComCoord, mapDepartmentIds],
  );
  const mapProtocolos = useMemo(
    () => filtrados.filter((p: any) => {
      if (!mapDepartmentIds.has(p.secretaria_id)) return false;
      // No mapa de Obras, mostrar apenas as ouvidorias atrasadas (vencidas).
      if (mapDepartmentOf(p.secretarias ?? {}) === "obras") {
        return p._s?.situacao === "vencido";
      }
      return true;
    }),
    [filtrados, mapDepartmentIds],
  );
  const localCoordById = useMemo(
    () => new Map((locaisComCoord as any[]).map((l) => [l.id, { lat: l.latitude, lng: l.longitude }])),
    [locaisComCoord],
  );
  const obrasSemCoord = useMemo(
    () => mapProtocolos.filter((p: any) =>
      mapDepartmentOf(p.secretarias ?? {}) === "obras" &&
      (p.latitude == null || p.longitude == null) && !localCoordById.has(p.local_id)).length,
    [mapProtocolos, localCoordById],
  );
  // Resumo operacional (motor de SLA único)
  const op = useMemo(() => resumoOperacional(filtrados as any), [filtrados]);
  const total = filtrados.length;
  const ativos = filtrados.filter(p => p.status !== "concluido");
  const concluidos = filtrados.filter(p => p.status === "concluido");
  const vencidos = ativos.filter(p => p._s.situacao === "vencido");
  const noPrazo = ativos.filter(p => p._s.situacao !== "vencido");

  // Atrasados ACUMULADOS até o fim do mês selecionado (ou até hoje se "all"/mês atual).
  // Considera todo o dataset, não só o filtrado por data_abertura.
  const refDateAtraso = useMemo(
    () => (mes === "all" ? new Date() : endOfMonthOrNow(mes)),
    [mes],
  );
  const atrasadosAcum = useMemo(
    () =>
      allEnriched
        .map(p => ({ p, r: estavaAtrasadoNaData(p as any, refDateAtraso) }))
        .filter(x => x.r.atrasado),
    [allEnriched, refDateAtraso],
  );
  // Total de protocolos abertos até refDate — base do percentual acumulado.
  const totalAcum = useMemo(
    () =>
      allEnriched.filter(p => {
        const d = new Date(p.data_abertura + "T00:00:00");
        return d <= refDateAtraso;
      }).length,
    [allEnriched, refDateAtraso],
  );
  const pctAtrasadosAcum =
    totalAcum > 0 ? ((atrasadosAcum.length / totalAcum) * 100).toFixed(2) : "0";

  // Prazo médio de resposta (dias) — entre data_abertura e data_conclusao
  const prazoMedio = useMemo(() => {
    const fechados = concluidos.filter(p => p.data_conclusao && p.data_abertura);
    if (fechados.length === 0) return 0;
    const soma = fechados.reduce(
      (acc, p) => acc + Math.max(0, differenceInDays(new Date(p.data_conclusao!), new Date(p.data_abertura))),
      0,
    );
    return Math.round((soma / fechados.length) * 10) / 10;
  }, [concluidos]);

  // Satisfação proxy: % no prazo (sem vencidos) sobre total
  const satisfacao = total > 0 ? Math.round(((total - vencidos.length) / total) * 100) : 100;
  const pctConcluidos = total > 0 ? ((concluidos.length / total) * 100).toFixed(2) : "0";
  const pctAndamento = total > 0 ? ((ativos.length / total) * 100).toFixed(2) : "0";
  const pctAtrasados = total > 0 ? ((vencidos.length / total) * 100).toFixed(2) : "0";
  const slaNoPrazo = ativos.length > 0 ? Math.round((noPrazo.length / ativos.length) * 100) : 100;

  // Evolução por mês — últimos 6 meses (abertos no mês)
  const evolucao = useMemo(() => {
    const meses: { mes: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const inicio = startOfMonth(subMonths(new Date(), i));
      const fim = startOfMonth(subMonths(new Date(), i - 1));
      const qtd = allEnriched.filter(p => {
        const d = new Date(p.data_abertura + "T00:00:00");
        return d >= inicio && d < fim;
      }).length;
      meses.push({ mes: format(inicio, "MMM/yy", { locale: ptBR }), total: qtd });
    }
    return meses;
  }, [allEnriched]);

  // Distribuição por categoria
  const categoriaData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtrados.forEach(p => {
      const c = categoriaDoProtocolo(p.tipo, p.categoria);
      counts[c] = (counts[c] ?? 0) + 1;
    });
    return CATEGORIAS.map(c => ({
      name: c.label,
      value: counts[c.value] ?? 0,
      color: CAT_COLORS[c.value],
    })).filter(d => d.value > 0);
  }, [filtrados]);

  // Top 10 assuntos
  const topAssuntos = useMemo(() => {
    const counts: Record<string, number> = {};
    filtrados.forEach(p => {
      const a = (p.assunto ?? "Outros").slice(0, 40);
      counts[a] = (counts[a] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);
  }, [filtrados]);

  // Manifestações por secretaria
  const porSecretaria = useMemo(() => {
    return secretarias
      .map(s => {
        const qtd = filtrados.filter(p => p.secretaria_id === s.id).length;
        return { nome: s.sigla || s.nome.slice(0, 14), full: s.nome, qtd };
      })
      .filter(s => s.qtd > 0)
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 8);
  }, [filtrados, secretarias]);

  // Reclamações - Área da Saúde (por assunto)
  const reclamacoesSaude = useMemo(() => {
    const saudeIds = secretarias.filter(s => /sa[uú]de/i.test(s.nome)).map(s => s.id);
    const recs = filtrados.filter(
      p => p.secretaria_id != null && saudeIds.includes(p.secretaria_id) && categoriaDoProtocolo(p.tipo, p.categoria) === "reclamacao",
    );
    const counts: Record<string, number> = {};
    recs.forEach(p => {
      const a = (p.assunto ?? "Outros").slice(0, 30);
      counts[a] = (counts[a] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 6);
  }, [filtrados, secretarias]);

  // Por unidade (local) na saúde
  const porUnidade = useMemo(() => {
    const saudeIds = secretarias.filter(s => /sa[uú]de/i.test(s.nome)).map(s => s.id);
    const counts: Record<string, number> = {};
    filtrados
      .filter(p => p.secretaria_id != null && saudeIds.includes(p.secretaria_id))
      .forEach(p => {
        const nome = (p as any).locais?.nome ?? "Sem unidade";
        counts[nome] = (counts[nome] ?? 0) + 1;
      });
    return Object.entries(counts)
      .map(([nome, qtd]) => ({ nome: nome.slice(0, 18), qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 8);
  }, [filtrados, secretarias]);

  // Situação dos protocolos (donut)
  const situacaoData = [
    { name: "Em andamento", value: ativos.length, color: "hsl(217 91% 60%)" },
    { name: "Concluídos", value: concluidos.length, color: "hsl(142 71% 45%)" },
    { name: "Atrasados", value: vencidos.length, color: "hsl(0 84% 60%)" },
  ].filter(d => d.value > 0);

  // Concentração por região (top locais)
  const porRegiao = useMemo(() => {
    const counts: Record<string, number> = {};
    filtrados.forEach(p => {
      const nome = (p as any).locais?.nome ?? "Sem local";
      counts[nome] = (counts[nome] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);
  }, [filtrados]);

  const openDrill = (title: string, predicate: (p: any) => boolean) => {
    setDrill({ titleBase: title, predicate, source: "filtrados" });
  };

  // Live-derived items for the drill dialog so concluding a protocol
  // updates the list without closing it.
  const drillItems = useMemo(() => {
    if (!drill) return [];
    const base = drill.source === "all" ? allEnriched : filtrados;
    return base.filter(drill.predicate);
  }, [drill, allEnriched, filtrados]);
  const drillData = useMemo(
    () => (drill ? { title: `${drill.titleBase} (${drillItems.length})`, items: drillItems } : null),
    [drill, drillItems],
  );

  const opcoesMes = useMemo(
    () => monthOptionsFromDates(allEnriched.map(p => p.data_abertura)),
    [allEnriched],
  );

  // Insights automáticos derivados das métricas do período
  const insights = useMemo(() => {
    const list: { icon: any; tone: string; text: React.ReactNode }[] = [];
    if (topAssuntos.length > 0 && total > 0) {
      const top = topAssuntos[0];
      const pct = Math.round((top.qtd / total) * 100);
      list.push({
        icon: Lightbulb,
        tone: "amber",
        text: <><span className="font-semibold">{top.nome}</span> representa <span className="font-semibold">{pct}%</span> das manifestações do período.</>,
      });
    }
    if (porSecretaria.length > 0 && total > 0) {
      const topSec = porSecretaria[0];
      const pct = Math.round((topSec.qtd / total) * 100);
      list.push({
        icon: Building,
        tone: "blue",
        text: <>Secretaria de <span className="font-semibold">{topSec.full}</span> concentra <span className="font-semibold">{topSec.qtd} protocolos ({pct}%)</span> do total.</>,
      });
    }
    list.push({
      icon: ShieldCheck,
      tone: vencidos.length === 0 ? "emerald" : "red",
      text: vencidos.length === 0
        ? <>Nenhum protocolo se encontra atrasado — todos estão dentro do prazo.</>
        : <><span className="font-semibold">{vencidos.length}</span> protocolo(s) em atraso requerem atenção imediata.</>,
    });
    if (prazoMedio > 0) {
      const meta = 5;
      const diff = Math.abs(Math.round(((prazoMedio - meta) / meta) * 100));
      const abaixo = prazoMedio <= meta;
      list.push({
        icon: Activity,
        tone: abaixo ? "emerald" : "orange",
        text: abaixo
          ? <>Tempo médio de resposta <span className="font-semibold">{diff}% abaixo da meta</span> ({prazoMedio} dias vs {meta} dias).</>
          : <>Tempo médio de resposta <span className="font-semibold">{diff}% acima da meta</span> de {meta} dias ({prazoMedio} dias atual).</>,
      });
    }
    // Conclusão vs andamento
    if (total > 0) {
      const metaConclusao = 70;
      const pctConc = Math.round((concluidos.length / total) * 100);
      const acimaMeta = pctConc >= metaConclusao;
      list.push({
        icon: acimaMeta ? CheckCircle2 : AlertCircle,
        tone: acimaMeta ? "emerald" : "orange",
        text: <><span className="font-semibold">{pctConc}%</span> dos protocolos estão concluídos. Meta: {metaConclusao}%.</>,
      });
    }
    // Protocolos no prazo vs fora
    if (ativos.length > 0) {
      const pctNoPrazo = Math.round((noPrazo.length / ativos.length) * 100);
      list.push({
        icon: pctNoPrazo >= 80 ? ShieldCheck : AlertTriangle,
        tone: pctNoPrazo >= 80 ? "emerald" : "amber",
        text: <><span className="font-semibold">{pctNoPrazo}%</span> dos protocolos em andamento estão dentro do prazo.</>,
      });
    }
    // Reclamações vs elogios
    const reclamacoes = filtrados.filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === "reclamacao").length;
    const elogios = filtrados.filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === "elogio").length;
    if (reclamacoes + elogios > 0) {
      const ratio = elogios > 0 ? Math.round((elogios / (reclamacoes + elogios)) * 100) : 0;
      list.push({
        icon: ratio >= 50 ? ThumbsUp : ThumbsDown,
        tone: ratio >= 50 ? "emerald" : "amber",
        text: <><span className="font-semibold">{ratio}%</span> de aprovação entre elogios e reclamações ({elogios} elogios vs {reclamacoes} reclamações).</>,
      });
    }
    // Participação do cidadão (protocolos com localização)
    const comGeo = filtrados.filter(p => p.latitude != null && p.longitude != null).length;
    if (total > 0) {
      const pctGeo = Math.round((comGeo / total) * 100);
      list.push({
        icon: MapPin,
        tone: "blue",
        text: <><span className="font-semibold">{pctGeo}%</span> das manifestações incluem localização geográfica.</>,
      });
    }
    // Evolução mês a mês (último vs penúltimo)
    if (evolucao.length >= 2) {
      const ultimo = evolucao[evolucao.length - 1];
      const penultimo = evolucao[evolucao.length - 2];
      const diff = ultimo.total - penultimo.total;
      const cresceu = diff > 0;
      list.push({
        icon: cresceu ? ArrowUpRight : ArrowDownRight,
        tone: cresceu ? "orange" : "emerald",
        text: <><span className="font-semibold">{cresceu ? "+" : ""}{diff}</span> manifestações em relação ao mês anterior ({penultimo.mes}: {penultimo.total} → {ultimo.mes}: {ultimo.total}).</>,
      });
    }
    return list;
  }, [topAssuntos, porSecretaria, vencidos.length, prazoMedio, total, concluidos.length, ativos.length, noPrazo.length, filtrados, evolucao]);

  const exportarRelatorio = () => {
    const linhas = [
      ["Numero", "Numero e-SIC", "Tipo", "Categoria", "Assunto", "Secretaria", "Status", "Aberto", "Concluído"].join(";"),
      ...filtrados.map(p =>
        [
          p.numero, p.numero_esic ?? "", p.tipo, categoriaDoProtocolo(p.tipo, p.categoria), (p.assunto ?? "").replace(/;/g, ","),
          (p as any).secretarias?.nome ?? "", p.status, p.data_abertura, p.data_conclusao ?? "",
        ].join(";"),
      ),
    ].join("\n");
    const blob = new Blob(["\ufeff" + linhas], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-ouvidoria-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral das manifestações da Ouvidoria — {mes === "all" ? "todos os meses" : formatMonthLabel(mes)}
          </p>
        </div>
        <SyncBadge />
        <div className="flex items-center gap-2">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value="all">Todos os meses</SelectItem>
              {opcoesMes.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportarRelatorio} className="gap-2">
            <Download className="h-4 w-4" /> Exportar Relatório
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      </div>

      {/* Triagem widget */}
      <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10">
        <CardContent className="py-3 px-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Inbox className="h-5 w-5 text-amber-600" />
            <div>
              <div className="text-xs text-muted-foreground">Triagem pendente</div>
              <div className="text-2xl font-bold leading-tight">{triagemStats?.pendentes ?? 0}</div>
            </div>
          </div>
          <div className="border-l pl-4">
            <div className="text-xs text-muted-foreground">Tempo médio (últimos 30d)</div>
            <div className="text-lg font-semibold">
              {triagemStats && triagemStats.amostra > 0 ? fmtDuracao(triagemStats.mediaHoras) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">{triagemStats?.amostra ?? 0} triadas</div>
          </div>
          <div className="border-l pl-4">
            <div className="text-xs text-muted-foreground">Mais antiga na fila</div>
            <div className={`text-lg font-semibold ${(triagemStats?.esperaMaiorHoras ?? 0) > 24 ? "text-red-600" : ""}`}>
              {triagemStats && triagemStats.pendentes > 0 ? fmtDuracao(triagemStats.esperaMaiorHoras) : "—"}
            </div>
          </div>
          <Link to="/tarefas" className="ml-auto">
            <Button size="sm" className="bg-yellow-400 text-yellow-950 hover:bg-yellow-500">Abrir fila de triagem</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Painel operacional do dia — cards clicáveis abrem a lista filtrada */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Operação do dia</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={AlertTriangle} tone="destructive" label="Vencidos" value={op.vencidos}
            hint="prazo estourado"
            onClick={() => openDrill("Protocolos vencidos", p => p.status !== "concluido" && calcularSla(p).dias < 0)} />
          <KpiCard icon={Clock} tone="warning" label="Vencendo hoje" value={op.venceHoje}
            hint="último dia do prazo"
            onClick={() => openDrill("Vencendo hoje", p => p.status !== "concluido" && calcularSla(p).dias === 0)} />
          <KpiCard icon={Timer} tone="violet" label="Vencendo em 3 dias" value={op.vence3Dias}
            hint="prazo crítico"
            onClick={() => openDrill("Vencendo em até 3 dias", p => p.status !== "concluido" && calcularSla(p).venceEm3Dias)} />
          <KpiCard icon={Inbox} tone="info" label="Aguardando resposta" value={op.aguardando}
            hint="sem resolução registrada"
            onClick={() => openDrill("Aguardando resposta", p => p.status !== "concluido" && calcularSla(p).aguardandoResposta)} />
          <KpiCard icon={Inbox} tone="warning" label="Pendentes de triagem" value={triagemStats?.pendentes ?? 0}
            hint="fila de triagem"
            onClick={() => navigate({ to: "/tarefas" })} />
          <KpiCard icon={CheckCircle2} tone="success" label="Concluídos" value={op.concluidos}
            hint="no período"
            onClick={() => openDrill("Protocolos concluídos", p => p.status === "concluido")} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={FileText} tone="primary" label="Total de Protocolos" value={total} hint="100% do período"
          onClick={() => openDrill("Todos os protocolos", () => true)} />
        <KpiCard icon={Clock} tone="info" label="Em Andamento" value={ativos.length} hint={`${pctAndamento}% do total`}
          onClick={() => openDrill("Protocolos em andamento", p => p.status !== "concluido")} />
        <KpiCard icon={CheckCircle2} tone="success" label="Concluídos" value={concluidos.length} hint={`${pctConcluidos}% do total`}
          onClick={() => openDrill("Protocolos concluídos", p => p.status === "concluido")} />
        <KpiCard
          icon={AlertTriangle}
          tone="destructive"
          label="Atrasados"
          value={atrasadosAcum.length}
          hint={mes === "all"
            ? `${pctAtrasadosAcum}% acumulados até hoje`
            : `${pctAtrasadosAcum}% acumulados até ${formatMonthLabel(mes)}`}
          onClick={() => {
            const ref = refDateAtraso;
            setDrill({
              titleBase: mes === "all"
                ? "Protocolos atrasados"
                : `Protocolos atrasados acumulados · ${formatMonthLabel(mes)}`,
              predicate: (p: any) => estavaAtrasadoNaData(p as any, ref).atrasado,
              source: "all",
            });
          }}
        />
        <KpiCard icon={Timer} tone="violet" label="Prazo Médio de Resposta" value={`${prazoMedio}`} suffix="dias" hint="Meta: 5 dias"
          onClick={() => openDrill("Protocolos concluídos (prazo médio)", p => p.status === "concluido" && !!p.data_conclusao)} />
        <KpiCard icon={Smile} tone="emerald" label="Satisfação do Usuário" value={`${satisfacao}%`}
          hint={satisfacao >= 80 ? "Ótimo" : satisfacao >= 60 ? "Bom" : "Atenção"}
          hintTrend={satisfacao >= 80 ? "up" : "down"}
          onClick={() => openDrill("Protocolos no prazo", p => p._s.situacao !== "vencido")} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução de Manifestações por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucao} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip content={<ChartTooltipContent unit="manifestações" />} cursor={{ stroke: "hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="total" stroke="hsl(217 91% 60%)" strokeWidth={2.5}
                    dot={{ r: 4, fill: "hsl(217 91% 60%)" }} label={{ position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Categorias</CardTitle>
            <p className="text-[11px] text-muted-foreground">Distribuição das manifestações</p>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoriaData.length > 0 ? categoriaData : [{ name: "—", value: 1, color: "hsl(var(--muted))" }]}
                    dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {(categoriaData.length > 0 ? categoriaData : [{ color: "hsl(var(--muted))" }]).map((d, i) => (
                      <Cell key={i} fill={(d as any).color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent unit="manifestações" total={total} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold">{total}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {categoriaData.map(d => {
                const pct = total > 0 ? ((d.value / total) * 100).toFixed(2) : "0";
                const cat = CATEGORIAS.find(c => c.label === d.name);
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => openDrill(`Categoria: ${d.name}`, p => categoriaDoProtocolo(p.tipo, p.categoria) === (cat?.value ?? "outros"))}
                    className="w-full flex items-center gap-2 text-xs rounded px-1 py-0.5 hover:bg-muted/60 transition"
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="font-medium">{d.name}</span>
                    <span className="ml-auto text-muted-foreground">{pct}% ({d.value})</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 Assuntos</CardTitle>
            <p className="text-[11px] text-muted-foreground">Mais recorrentes no período</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {topAssuntos.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
              {(() => {
                const max = Math.max(1, ...topAssuntos.map(a => a.qtd));
                return topAssuntos.map((a, idx) => (
                  <button
                    key={a.nome}
                    type="button"
                    onClick={() => openDrill(`Assunto: ${a.nome}`, p => (p.assunto ?? "Outros").slice(0, 40) === a.nome)}
                    className="group w-full grid grid-cols-[20px_1fr_auto] items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition"
                  >
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground group-hover:text-primary">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" title={a.nome}>{a.nome}</p>
                      <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(a.qtd / max) * 100}%`,
                            background: `linear-gradient(90deg, hsl(217 91% 60%), hsl(262 83% 58%))`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-foreground min-w-[20px] text-right">{a.qtd}</span>
                  </button>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Manifestações por Secretaria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porSecretaria} margin={{ top: 20, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip content={<ChartTooltipContent unit="manifestações" />} cursor={{ fill: "hsl(217 91% 60% / 0.08)" }} />
                  <Bar
                    dataKey="qtd"
                    fill="hsl(217 91% 60%)"
                    radius={[6, 6, 0, 0]}
                    label={{ position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    cursor="pointer"
                    onClick={(d: any) => {
                      const sec = secretarias.find(s => s.nome === d?.full);
                      if (sec) openDrill(`Secretaria: ${sec.nome}`, p => p.secretaria_id === sec.id);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reclamações — Área da Saúde</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-2">Por assunto</p>
                <div className="space-y-1.5">
                  {reclamacoesSaude.length === 0 && <p className="text-xs text-muted-foreground">Sem reclamações.</p>}
                  {(() => {
                    const max = Math.max(1, ...reclamacoesSaude.map(r => r.qtd));
                    const saudeIds = secretarias.filter(s => /sa[uú]de/i.test(s.nome)).map(s => s.id);
                    return reclamacoesSaude.map(r => (
                      <button
                        key={r.nome}
                        type="button"
                        onClick={() => openDrill(`Saúde — Reclamação: ${r.nome}`, p =>
                          p.secretaria_id != null && saudeIds.includes(p.secretaria_id) &&
                          categoriaDoProtocolo(p.tipo, p.categoria) === "reclamacao" &&
                          (p.assunto ?? "Outros").slice(0, 30) === r.nome,
                        )}
                        className="w-full flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/60 transition"
                      >
                        <span className="text-[11px] truncate flex-1" title={r.nome}>{r.nome}</span>
                        <div className="h-2 w-16 rounded-sm bg-muted overflow-hidden">
                          <div className="h-full bg-orange-500" style={{ width: `${(r.qtd / max) * 100}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold w-5 text-right">{r.qtd}</span>
                      </button>
                    ));
                  })()}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-2">Por unidade (UBS)</p>
                <div className="space-y-1">
                  {porUnidade.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
                  {(() => {
                    const max = Math.max(1, ...porUnidade.map(u => u.qtd));
                    const saudeIds = secretarias.filter(s => /sa[uú]de/i.test(s.nome)).map(s => s.id);
                    return porUnidade.map(u => {
                      const intensity = Math.ceil((u.qtd / max) * 5);
                      return (
                        <button
                          key={u.nome}
                          type="button"
                          onClick={() => openDrill(`Saúde — Unidade: ${u.nome}`, p =>
                            p.secretaria_id != null && saudeIds.includes(p.secretaria_id) &&
                            (((p as any).locais?.nome ?? "Sem unidade").slice(0, 18) === u.nome),
                          )}
                          className="w-full flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/60 transition"
                        >
                          <span className="text-[11px] truncate flex-1" title={u.nome}>{u.nome}</span>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span key={i} className="h-3 w-3 rounded-sm"
                                style={{ background: i < intensity ? `hsl(25 95% ${65 - i * 6}%)` : "hsl(var(--muted))" }} />
                            ))}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Situação dos Protocolos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={situacaoData.length > 0 ? situacaoData : [{ name: "—", value: 1, color: "hsl(var(--muted))" }]}
                    dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {(situacaoData.length > 0 ? situacaoData : [{ color: "hsl(var(--muted))" }]).map((d, i) => (
                      <Cell key={i} fill={(d as any).color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent unit="protocolo(s)" total={total} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold">{total}</span>
                <span className="text-[10px] uppercase text-muted-foreground">Total</span>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {situacaoData.map(d => {
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                const pred =
                  d.name === "Em andamento" ? (p: any) => p.status !== "concluido"
                  : d.name === "Concluídos" ? (p: any) => p.status === "concluido"
                  : (p: any) => p.status !== "concluido" && p._s.situacao === "vencido";
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => openDrill(`Situação: ${d.name}`, pred)}
                    className="w-full flex items-center gap-2 text-xs rounded px-1 py-0.5 hover:bg-muted/60 transition"
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="font-medium">{d.name}</span>
                    <span className="ml-auto text-muted-foreground">{d.value} ({pct}%)</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: SLA + Regiões */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">SLA — Prazos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <Gauge label="Protocolos no Prazo" value={slaNoPrazo} suffix="%" meta="Meta: 90%" good={slaNoPrazo >= 90} />
              <Gauge label="Tempo Médio de Resposta" value={prazoMedio} suffix="dias" meta="Meta: 5 dias" good={prazoMedio <= 5} max={15} />
              <Gauge label="Protocolos Atrasados" value={vencidos.length} meta="Meta: 0" good={vencidos.length === 0} max={Math.max(20, vencidos.length)} invert />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Concentração de Manifestações por Local
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                {porRegiao.slice(0, 5).map((r, i) => (
                  <RegiaoRow key={r.nome} pos={i + 1} nome={r.nome} qtd={r.qtd} max={porRegiao[0]?.qtd ?? 1}
                    onClick={() => openDrill(`Local: ${r.nome}`, p => ((p as any).locais?.nome ?? "Sem local") === r.nome)} />
                ))}
              </div>
              <div className="space-y-1.5">
                {porRegiao.slice(5, 10).map((r, i) => (
                  <RegiaoRow key={r.nome} pos={i + 6} nome={r.nome} qtd={r.qtd} max={porRegiao[0]?.qtd ?? 1}
                    onClick={() => openDrill(`Local: ${r.nome}`, p => ((p as any).locais?.nome ?? "Sem local") === r.nome)} />
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-muted-foreground border-t pt-3">
              <Legenda dot="hsl(0 84% 60%)" label="Alta concentração" />
              <Legenda dot="hsl(48 96% 53%)" label="Média concentração" />
              <Legenda dot="hsl(142 71% 45%)" label="Baixa concentração" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Mapa de Manifestações
          </CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between md:justify-end">
            <MapDepartmentToggle value={mapScope} onChange={setMapScope} />
            <Link to="/mapa" className="text-xs text-primary hover:underline whitespace-nowrap">
              Abrir mapa completo →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <ManifestacoesMap
            height={320}
            secretarias={mapSecretarias
              .filter((s) => s.latitude != null && s.longitude != null)
              .map<SecretariaPoint>((s) => ({
                id: s.id, lat: s.latitude, lng: s.longitude, nome: s.nome,
                sigla: s.sigla, endereco: s.endereco, icone: s.icone,
              }))}
            locais={mapLocais.map<LocalPoint>((l: any) => ({
              id: l.id,
              lat: l.latitude,
              lng: l.longitude,
              nome: l.nome,
              secretaria: l.secretarias?.nome,
              secretariaIcone: l.secretarias?.icone,
              mapDepartment: mapDepartmentOf(l.secretarias ?? {}),
            }))}
            onOpenProtocolo={(id) => {
              const p = enriched.find((x: any) => x.id === id);
              if (p) setDetail(p);
            }}
            points={mapProtocolos
              .map((p: any) => ({
                id: p.id,
                lat: p.latitude ?? localCoordById.get(p.local_id)?.lat ?? NaN,
                lng: p.longitude ?? localCoordById.get(p.local_id)?.lng ?? NaN,
                numero: p.numero,
                numero_esic: p.numero_esic,
                assunto: p.assunto,
                endereco: p.endereco,
                status: p.status,
                secretaria: p.secretarias?.nome,
                secretariaIcone: p.secretarias?.icone,
                data_abertura: p.data_abertura,
                data_conclusao: p.data_conclusao,
                categoria: categoriaDoProtocolo(p.tipo, p.categoria),
                tipo: p.tipo,
                local: p.locais?.nome,
                local_id: p.local_id,
                mapDepartment: mapDepartmentOf(p.secretarias ?? {}),
              }))}
          />
          {mapScope !== "saude" && obrasSemCoord > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {obrasSemCoord} protocolo(s) de Obras ainda sem localização no mapa. Abra o protocolo e marque o endereço para ele aparecer.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center">
        Dados atualizados em {format(new Date(), "dd/MM/yyyy HH:mm")}
      </p>

      <DrillDialog
        data={drillData}
        onOpenChange={(v) => !v && setDrill(null)}
        onSelect={(p) => {
          if (p._antigo) {
            const [, source, numero] = String(p.id).split("-");
            setDrill(null);
            navigate({
              to: "/protocolos-antigos/$source/$numero",
              params: { source, numero },
            });
            return;
          }
          // Keep the drill open so the user returns to the KPI list after
          // acting on a single protocol.
          setDetail(p);
        }}
      />
      <ProtocoloDetailDialog protocolo={detail} open={!!detail} onOpenChange={(v) => !v && setDetail(null)} />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint, hintTrend, suffix, tone, onClick }: {
  icon: any; label: string; value: number | string; hint?: string; suffix?: string;
  hintTrend?: "up" | "down";
  tone: "primary" | "info" | "success" | "destructive" | "violet" | "emerald" | "warning";
  onClick?: () => void;
}) {
  const tones: Record<string, { bg: string; fg: string; ring: string; grad: string }> = {
    warning:     { bg: "bg-orange-500/10",  fg: "text-orange-600",    ring: "ring-orange-500/20",  grad: "from-orange-500/10 via-transparent to-transparent" },
    primary:     { bg: "bg-primary/10",     fg: "text-primary",       ring: "ring-primary/20",     grad: "from-primary/10 via-transparent to-transparent" },
    info:        { bg: "bg-amber-500/10",   fg: "text-amber-600",     ring: "ring-amber-500/20",   grad: "from-amber-500/10 via-transparent to-transparent" },
    success:     { bg: "bg-emerald-500/10", fg: "text-emerald-600",   ring: "ring-emerald-500/20", grad: "from-emerald-500/10 via-transparent to-transparent" },
    destructive: { bg: "bg-destructive/10", fg: "text-destructive",   ring: "ring-destructive/20", grad: "from-destructive/10 via-transparent to-transparent" },
    violet:      { bg: "bg-violet-500/10",  fg: "text-violet-600",    ring: "ring-violet-500/20",  grad: "from-violet-500/10 via-transparent to-transparent" },
    emerald:     { bg: "bg-teal-500/10",    fg: "text-teal-600",      ring: "ring-teal-500/20",    grad: "from-teal-500/10 via-transparent to-transparent" },
  };
  const t = tones[tone];
  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden border ring-1 ${t.ring} bg-gradient-to-br ${t.grad} ${onClick ? "cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 hover:ring-2" : ""}`}
    >
      <CardContent className="p-4 relative">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl ${t.bg} ${t.fg} flex items-center justify-center shrink-0 shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
            <p className="text-2xl font-bold leading-tight tracking-tight">
              {value}{suffix && <span className="text-sm font-medium text-muted-foreground ml-1">{suffix}</span>}
            </p>
          </div>
        </div>
        {hint && (
          <p className={`mt-2 text-[11px] flex items-center gap-1 ${hintTrend === "up" ? "text-emerald-600" : hintTrend === "down" ? "text-destructive" : "text-muted-foreground"}`}>
            {hint}{hintTrend === "up" && <TrendingUp className="h-3 w-3" />}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Gauge({ label, value, suffix, meta, good, max = 100, invert }: {
  label: string; value: number; suffix?: string; meta: string;
  good: boolean; max?: number; invert?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = good ? "hsl(142 71% 45%)" : invert ? "hsl(0 84% 60%)" : "hsl(38 92% 50%)";
  const radius = 42;
  const circ = Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-[11px] text-muted-foreground mb-2">{label}</p>
      <div className="relative w-28 h-16">
        <svg viewBox="0 0 100 60" className="w-full h-full">
          <path d={`M 8 56 A ${radius} ${radius} 0 0 1 92 56`} stroke="hsl(var(--muted))" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d={`M 8 56 A ${radius} ${radius} 0 0 1 92 56`}
            stroke={color} strokeWidth="8" fill="none" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-xl font-bold leading-none">
            {value}{suffix && <span className="text-xs font-medium text-muted-foreground ml-0.5">{suffix}</span>}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{meta}</p>
    </div>
  );
}

function RegiaoRow({ pos, nome, qtd, max, onClick }: { pos: number; nome: string; qtd: number; max: number; onClick?: () => void }) {
  const ratio = qtd / max;
  // 3 cores: vermelho (alta), amarelo (média), verde (baixa)
  const color = ratio > 0.66 ? "hsl(0 84% 60%)" : ratio > 0.33 ? "hsl(48 96% 53%)" : "hsl(142 71% 45%)";
  const textColor = ratio > 0.33 && ratio <= 0.66 ? "#000" : "#fff";
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/60 transition text-left">
      <span className="h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0" style={{ background: color, color: textColor }}>
        {qtd}
      </span>
      <span className="text-xs text-muted-foreground w-4 text-right">{pos}.</span>
      <span className="text-xs font-medium truncate flex-1" title={nome}>{nome}</span>
    </button>
  );
}

function Legenda({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

function InsightCard({ icon: Icon, tone, text }: { icon: any; tone: string; text: React.ReactNode }) {
  const tones: Record<string, { bg: string; fg: string; ring: string }> = {
    amber:   { bg: "bg-amber-500/10",   fg: "text-amber-600",   ring: "ring-amber-500/20" },
    blue:    { bg: "bg-blue-500/10",    fg: "text-blue-600",    ring: "ring-blue-500/20" },
    emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-600", ring: "ring-emerald-500/20" },
    orange:  { bg: "bg-orange-500/10",  fg: "text-orange-600",  ring: "ring-orange-500/20" },
    red:     { bg: "bg-destructive/10", fg: "text-destructive", ring: "ring-destructive/20" },
  };
  const t = tones[tone] ?? tones.blue;
  return (
    <div className={`flex items-start gap-3 rounded-xl border bg-card/50 ring-1 ${t.ring} p-3 transition hover:bg-card`}>
      <div className={`h-9 w-9 shrink-0 rounded-lg ${t.bg} ${t.fg} flex items-center justify-center`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs leading-relaxed text-foreground/90 mt-0.5">{text}</p>
    </div>
  );
}

function DrillDialog({
  data,
  onOpenChange,
  onSelect,
}: {
  data: { title: string; items: any[] } | null;
  onOpenChange: (v: boolean) => void;
  onSelect: (p: any) => void;
}) {
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const arr = (data?.items ?? []).slice();
    // Ordena do mais atrasado (dias mais negativos) para o menos
    arr.sort((a: any, b: any) => {
      const ad = a?._s?.dias ?? Number.POSITIVE_INFINITY;
      const bd = b?._s?.dias ?? Number.POSITIVE_INFINITY;
      return ad - bd;
    });
    const term = q.trim().toLowerCase();
    if (!term) return arr;
    return arr.filter((p: any) => {
      const num = String(p.numero ?? "").toLowerCase();
      const assunto = String(p.assunto ?? "").toLowerCase();
      const sol = String(p.solicitante ?? "").toLowerCase();
      return num.includes(term) || assunto.includes(term) || sol.includes(term);
    });
  }, [data, q]);
  return (
    <Dialog open={!!data} onOpenChange={(v) => { if (!v) setQ(""); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{data?.title ?? ""}</DialogTitle>
          <DialogDescription>
            Clique em um protocolo para abrir os detalhes.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número, assunto ou solicitante..."
            className="pl-8"
          />
        </div>
        <div className="overflow-y-auto -mx-2 px-2">
          {!data || items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum protocolo encontrado.</p>
          ) : (
            <ul className="divide-y">
              {items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="w-full text-left py-2 px-2 hover:bg-muted/60 transition rounded flex items-center gap-3"
                  >
                    <span className="font-mono text-xs font-semibold shrink-0">{p.numero}</span>
                    <span className="text-sm truncate flex-1" title={p.assunto ?? ""}>
                      {p.assunto ?? "Sem assunto"}
                    </span>
                    {typeof p?._s?.dias === "number" && p._s.dias < 0 && (
                      <Badge variant="outline" className="text-[10px] shrink-0 bg-destructive/10 text-destructive border-destructive/30">
                        {Math.abs(p._s.dias)}d atraso
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {(p as any).secretarias?.sigla ?? (p as any).secretarias?.nome ?? "—"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {(() => {
                        const s = String(p.data_abertura);
                        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
                        const d = iso
                          ? new Date(+iso[1], +iso[2] - 1, +iso[3])
                          : new Date(s);
                        return format(d, "dd/MM/yyyy");
                      })()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SyncBadge() {
  const { recentlySynced } = useRealtimeSync();
  return (
    <div
      className={`flex items-center gap-1.5 text-xs transition-opacity duration-500 ${
        recentlySynced ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-emerald-700 dark:text-emerald-400 font-medium">Atualizado agora</span>
    </div>
  );
}
