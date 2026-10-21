import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  MapPin,
  PieChart as PieChartIcon,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BiMap, type BiMapPoint } from "@/components/bi-map";
import { ChartTooltipCard } from "@/components/chart-tooltip";
import { secretariasComManifestacoes } from "@/lib/bi-visualization";
import { supabase } from "@/integrations/supabase/client";
import brasaoBrusque from "@/assets/brasao-brusque.png.asset.json";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BiStats = {
  gerado_em: string;
  mes_selecionado: string | null;
  totais: {
    total: number;
    abertas: number;
    em_andamento: number;
    concluidas: number;
    atrasadas: number;
  };
  por_status: { status: string; total: number }[];
  por_tipo: { tipo: string; total: number }[];
  por_secretaria: {
    nome: string;
    sigla: string | null;
    total: number;
    concluidas: number;
    reclamacoes: number;
  }[];
  por_mes: { mes: string; total: number; concluidas: number }[];
  por_local: { nome: string; total: number }[];
  por_bairro: { nome: string; total: number }[];
  sem_bairro: number;
  por_mes_bairro: { mes: string; bairro: string; total: number }[];
  obras_por_bairro: {
    bairro: string;
    total: number;
    atrasadas: number;
    lat: number | null;
    lng: number | null;
  }[];
  obras_sem_bairro: number;
  saude_locais: {
    nome: string;
    total: number;
    atrasadas: number;
    lat: number;
    lng: number;
  }[];
  saude_sem_ponto: number;
};

const biStatsOptions = (mes: string | null) =>
  queryOptions({
    queryKey: ["bi-estatisticas", mes ?? "todos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BiStats> => {
      const { data, error } = await supabase.rpc(
        "bi_estatisticas",
        mes ? { p_mes: mes } : {},
      );
      if (error) throw error;
      return data as unknown as BiStats;
    },
  });

export const Route = createFileRoute("/bi")({
  head: () => ({
    meta: [
      { title: "Painel Analítico | Ouvidoria de Brusque" },
      {
        name: "description",
        content:
          "Indicadores públicos e agregados da Ouvidoria de Brusque: mapas por bairro e unidade de saúde, volume por secretaria, situação e evolução mensal.",
      },
      { property: "og:title", content: "Painel Analítico | Ouvidoria de Brusque" },
      {
        property: "og:description",
        content:
          "Indicadores públicos e agregados da Ouvidoria de Brusque: mapas por bairro e unidade de saúde, volume por secretaria, situação e evolução mensal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(biStatsOptions(null)),
  component: BiPage,
});

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloMes(mes: string) {
  const [ano, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${ano.slice(2)}`;
}

const TIPO_LABEL: Record<string, string> = {
  ouvidoria: "Ouvidoria",
  lai: "LAI",
  esic: "e-SIC",
};

function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-lg border border-border bg-card/80 shadow-lg shadow-black/20 ${className}`}
    >
      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="text-primary">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
      </header>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card/80 px-3 py-2.5 shadow-lg shadow-black/20">
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} aria-hidden />
      <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** Medidor semicircular estilo Grafana. */
function Gauge({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const semicircle = Math.PI * 60;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 82" className="w-full max-w-[150px]">
        <path
          d="M 10 76 A 60 60 0 0 1 130 76"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 10 76 A 60 60 0 0 1 130 76"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${pct * semicircle} ${semicircle}`}
        />
        <text
          x="70"
          y="72"
          textAnchor="middle"
          fontSize="26"
          fontWeight="700"
          className="fill-foreground tabular-nums"
        >
          {value}
        </text>
      </svg>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const tooltipProps = {
  cursor: { fill: "var(--muted)", opacity: 0.35 },
  content: <ChartTooltipCardFromPayload />,
} as const;

function ChartTooltipCardFromPayload(props: any) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipCard
      title={label}
      rows={payload.map((p: any) => ({
        label: p.name ?? p.dataKey,
        value: p.value,
        color: p.color ?? p.payload?.fill,
      }))}
    />
  );
}

function PieTooltip(props: any) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <ChartTooltipCard
      rows={[{ label: p.name, value: p.value, color: p.payload?.fill }]}
    />
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-muted-foreground">
      Sem dados no período
    </div>
  );
}

const DISTRIBUTION_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--brusque-gold)", "var(--chart-4)", "var(--chart-5)", "var(--brusque-green)", "var(--brusque-red)"];

function CompactDonut({ data }: { data: { nome: string; rotulo?: string; total: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.total, 0);
  if (total === 0) return <EmptyState />;
  return (
    <div className="flex h-[248px] flex-col gap-2">
      <div className="relative h-[144px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="nome" innerRadius={46} outerRadius={66} paddingAngle={2} stroke="var(--card)">
              {data.map((item, i) => <Cell key={item.nome} fill={DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <strong className="text-xl tabular-nums">{total}</strong>
          <span className="text-[10px] text-muted-foreground">Total</span>
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {data.map((item, i) => (
          <li key={item.nome} className="flex items-start gap-2 text-xs" title={item.nome}>
            <svg width="8" height="8" className="mt-1 shrink-0" aria-hidden><rect width="8" height="8" rx="2" fill={DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length]} /></svg>
            <span className="min-w-0 flex-1 break-words">{item.rotulo || item.nome}</span>
            <strong className="shrink-0 tabular-nums">{item.total}</strong>
            <span className="w-11 shrink-0 text-right tabular-nums text-muted-foreground">{(item.total / total * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BiPage() {
  const queryClient = useQueryClient();
  const [mes, setMes] = useState<string | null>(null);
  const { data: stats } = useSuspenseQuery(biStatsOptions(mes));
  const [atualizando, setAtualizando] = useState(false);

  const mesesOpcoes = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < 12; i++) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  }, []);

  const taxaConclusao =
    stats.totais.total > 0
      ? Math.round((stats.totais.concluidas / stats.totais.total) * 100)
      : 0;

  const secretarias = secretariasComManifestacoes(stats.por_secretaria).map((s) => ({
    ...s,
    rotulo: s.sigla || s.nome,
  }));
  const rankingReclamacoes = [...secretarias]
    .filter((s) => s.reclamacoes > 0)
    .sort((a, b) => b.reclamacoes - a.reclamacoes)
    .slice(0, 8);
  const meses = stats.por_mes.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) }));
  const tipos = stats.por_tipo.map((t) => ({
    ...t,
    nome: TIPO_LABEL[t.tipo] ?? t.tipo,
  }));

  // --- Obras por bairro (mapa + destaques) ---
  const obrasBairros = stats.obras_por_bairro;
  const topObrasTotal = obrasBairros[0];
  const topObrasAtrasadas =
    [...obrasBairros].sort((a, b) => b.atrasadas - a.atrasadas)[0] ?? null;
  const temAtrasadaObras = (topObrasAtrasadas?.atrasadas ?? 0) > 0;
  const obrasPoints: BiMapPoint[] = obrasBairros
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => {
      const eMaisAtrasado = temAtrasadaObras && b.bairro === topObrasAtrasadas?.bairro;
      return {
        id: b.bairro,
        nome: b.bairro,
        lat: b.lat as number,
        lng: b.lng as number,
        total: b.total,
        cor: eMaisAtrasado ? "var(--brusque-red)" : "var(--brusque-gold)",
        extra: b.atrasadas > 0 ? `${b.atrasadas} atrasadas` : undefined,
        destaque: eMaisAtrasado,
      };
    });

  // --- Saúde por local (UBS e pontos fixos) ---
  const topSaude = stats.saude_locais[0];
  const saudePoints: BiMapPoint[] = stats.saude_locais.map((l) => ({
    id: l.nome,
    nome: l.nome,
    lat: l.lat,
    lng: l.lng,
    total: l.total,
    cor: l.nome === topSaude?.nome ? "var(--chart-1)" : "var(--chart-2)",
    extra: l.atrasadas > 0 ? `${l.atrasadas} atrasadas` : undefined,
    destaque: l.nome === topSaude?.nome && l.total > 0,
  }));

  async function atualizar() {
    setAtualizando(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["bi-estatisticas"] });
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
        <header className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/80 px-4 py-3 shadow-lg shadow-black/20">
          <img
            src={brasaoBrusque.url}
            alt="Prefeitura de Brusque"
            className="h-10 w-auto object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">
              Painel Analítico da Ouvidoria
            </h1>
            <p className="text-sm text-muted-foreground">
              Prefeitura Municipal de Brusque — indicadores agregados, sem dados
              individuais de manifestações
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Select value={mes ?? "todos"} onValueChange={(value) => setMes(value === "todos" ? null : value)}>
              <SelectTrigger aria-label="Filtrar por mês" className="w-[190px] gap-2 border-border bg-muted text-xs font-semibold">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark border-border bg-popover text-popover-foreground">
                <SelectItem value="todos">Todos os meses</SelectItem>
                {mesesOpcoes.map((m) => (
                  <SelectItem key={m} value={m}>{rotuloMes(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
              Atualizado em {new Date(stats.gerado_em).toLocaleString("pt-BR")}
            </span>
            <button
              type="button"
              onClick={atualizar}
              disabled={atualizando}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="Total de manifestações"
            value={stats.totais.total}
            sub={mes ? `abertas em ${rotuloMes(mes)}` : "desde o início do sistema"}
            accent="bg-chart-1"
          />
          <StatCard
            label="Abertas"
            value={stats.totais.abertas}
            sub="aguardando atendimento"
            accent="bg-brusque-red"
          />
          <StatCard
            label="Em andamento"
            value={stats.totais.em_andamento}
            sub="em tratativa nas secretarias"
            accent="bg-brusque-gold"
          />
          <StatCard
            label="Concluídas"
            value={stats.totais.concluidas}
            sub={`${taxaConclusao}% do total`}
            accent="bg-brusque-green"
          />
          <StatCard
            label="Atrasadas"
            value={stats.totais.atrasadas}
            sub="fora do prazo e não concluídas"
            accent="bg-brusque-red"
          />
        </div>

        {/* Mapa Obras + destaques e medidores */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel
            title="Obras — manifestações por bairro"
            icon={<MapPin className="h-4 w-4" />}
            className="lg:col-span-2"
          >
            {obrasPoints.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <BiMap points={obrasPoints} />
                <p className="pt-2 text-[11px] text-muted-foreground">
                  Círculos proporcionais ao volume; contorno vermelho marca o bairro com
                  mais ouvidorias atrasadas.
                  {stats.obras_sem_bairro > 0 &&
                    ` ${stats.obras_sem_bairro} manifestações de Obras sem bairro identificado.`}
                </p>
              </>
            )}
          </Panel>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-lg border border-border bg-card/80 px-3 py-2.5 shadow-lg shadow-black/20">
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <Flame className="h-3.5 w-3.5 text-brusque-gold" />
                  Mais manifestações (Obras)
                </p>
                <p className="mt-0.5 truncate text-base font-bold">
                  {topObrasTotal ? topObrasTotal.bairro : "—"}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {topObrasTotal ? `${topObrasTotal.total} manifestações` : "sem dados"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card/80 px-3 py-2.5 shadow-lg shadow-black/20">
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-brusque-red" />
                  Mais atrasadas (Obras)
                </p>
                <p className="mt-0.5 truncate text-base font-bold">
                  {temAtrasadaObras ? topObrasAtrasadas?.bairro : "—"}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {temAtrasadaObras
                    ? `${topObrasAtrasadas?.atrasadas} atrasadas`
                    : "nenhuma atrasada"}
                </p>
              </div>
            </div>
            <Panel title="Resumo do período" icon={<Activity className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-2">
                <Gauge
                  label="Recebidas"
                  value={stats.totais.total}
                  max={Math.max(stats.totais.total, 1)}
                  color="var(--chart-1)"
                />
                <Gauge
                  label="Atrasadas"
                  value={stats.totais.atrasadas}
                  max={Math.max(stats.totais.total, 1)}
                  color="var(--brusque-red)"
                />
              </div>
            </Panel>
          </div>
        </div>

        {/* Mapa Saúde + locais */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel
            title="Saúde — UBS e unidades com mais manifestações"
            icon={<MapPin className="h-4 w-4" />}
            className="lg:col-span-2"
          >
            {saudePoints.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <BiMap points={saudePoints} />
                <p className="pt-2 text-[11px] text-muted-foreground">
                  Círculos proporcionais ao volume de manifestações de cada unidade.
                  {stats.saude_sem_ponto > 0 &&
                    ` ${stats.saude_sem_ponto} manifestações da Saúde sem unidade vinculada.`}
                </p>
              </>
            )}
          </Panel>

          <Panel
            title="Unidades de saúde — ranking"
            icon={<BarChart3 className="h-4 w-4" />}
          >
            {stats.saude_locais.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(240, Math.min(stats.saude_locais.length, 10) * 40)}
              >
                <BarChart
                  data={stats.saude_locais.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={130}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipProps} />
                  <Bar
                    dataKey="total"
                    name="Manifestações"
                    fill="var(--chart-2)"
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Evolução mensal"
            icon={<TrendingUp className="h-4 w-4" />}
            className="h-[320px]"
          >
            {meses.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={meses} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="biTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="biConcluidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brusque-green)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--brusque-green)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipProps} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Recebidas"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#biTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="concluidas"
                    name="Concluídas"
                    stroke="var(--brusque-green)"
                    strokeWidth={2}
                    fill="url(#biConcluidas)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel
            title="Bairros com mais manifestações"
            icon={<Clock className="h-4 w-4" />}
            className="h-[320px]"
          >
            {stats.por_bairro.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer
                    width="100%"
                    height={230}
                  >
                    <BarChart
                      data={stats.por_bairro}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="nome"
                        width={110}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip {...tooltipProps} />
                      <Bar dataKey="total" name="Manifestações" fill="var(--chart-3)" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {stats.sem_bairro > 0 && (
                  <p className="pt-2 text-[11px] text-muted-foreground">
                    {stats.sem_bairro} manifestações sem bairro identificado no endereço
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Panel
            title="Manifestações por secretaria"
            icon={<PieChartIcon className="h-4 w-4" />}
          >
            <CompactDonut data={secretarias.map((s) => ({ nome: s.nome, rotulo: s.rotulo, total: s.total }))} />
          </Panel>
          <Panel
            title="Secretarias com mais reclamações"
            icon={<Flame className="h-4 w-4" />}
          >
            {rankingReclamacoes.length === 0 ? <EmptyState /> : (
              <ol className="h-[248px] space-y-3 overflow-y-auto pr-1">
                {rankingReclamacoes.map((s, i) => (
                  <li key={s.nome}>
                    <div className="mb-1 flex items-start gap-2 text-xs">
                      <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 break-words">{s.nome}</span>
                      <strong className="shrink-0 tabular-nums">{s.reclamacoes}</strong>
                    </div>
                    <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brusque-red" style={{ width: `${s.reclamacoes / rankingReclamacoes[0].reclamacoes * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel
            title="Por tipo de manifestação"
            icon={<Activity className="h-4 w-4" />}
          >
            <CompactDonut data={tipos.map((t) => ({ nome: t.nome, total: t.total }))} />
          </Panel>
        </div>

        <footer className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-5 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-brusque-green" />
            Dados anonimizados e agregados — nenhuma manifestação individual é exposta
          </span>
          <span>OuviDesk · Prefeitura de Brusque</span>
        </footer>
      </div>
    </div>
  );
}
