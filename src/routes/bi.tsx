import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  MapPin,
  PieChart as PieChartIcon,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
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

import { ChartTooltipCard } from "@/components/chart-tooltip";
import { supabase } from "@/integrations/supabase/client";

type BiStats = {
  gerado_em: string;
  totais: { total: number; abertas: number; em_andamento: number; concluidas: number };
  por_status: { status: string; total: number }[];
  por_tipo: { tipo: string; total: number }[];
  por_secretaria: { nome: string; sigla: string | null; total: number; concluidas: number }[];
  por_mes: { mes: string; total: number; concluidas: number }[];
  por_local: { nome: string; total: number }[];
};

const biStatsOptions = queryOptions({
  queryKey: ["bi-estatisticas"],
  staleTime: 5 * 60 * 1000,
  queryFn: async (): Promise<BiStats> => {
    const { data, error } = await supabase.rpc("bi_estatisticas");
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
          "Indicadores públicos e agregados da Ouvidoria de Brusque: volume por secretaria, situação, região e evolução mensal.",
      },
      { property: "og:title", content: "Painel Analítico | Ouvidoria de Brusque" },
      {
        property: "og:description",
        content:
          "Indicadores públicos e agregados da Ouvidoria de Brusque: volume por secretaria, situação, região e evolução mensal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(biStatsOptions),
  component: BiPage,
});

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloMes(mes: string) {
  const [ano, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${ano.slice(2)}`;
}

const STATUS_LABEL: Record<string, string> = {
  aberto: "Abertas",
  em_andamento: "Em andamento",
  concluido: "Concluídas",
};

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
      className={`rounded-lg border border-border bg-card/80 shadow-lg shadow-black/20 flex flex-col overflow-hidden ${className}`}
    >
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
        <span className="text-primary">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
      </header>
      <div className="flex-1 p-4 min-h-0">{children}</div>
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
    <div className="rounded-lg border border-border bg-card/80 shadow-lg shadow-black/20 p-4 relative overflow-hidden">
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} aria-hidden />
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
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
    <div className="h-full min-h-[180px] flex items-center justify-center text-sm text-muted-foreground">
      Sem dados no período
    </div>
  );
}

function BiPage() {
  const { data: stats } = useSuspenseQuery(biStatsOptions);
  const queryClient = useQueryClient();
  const [atualizando, setAtualizando] = useState(false);

  const taxaConclusao =
    stats.totais.total > 0
      ? Math.round((stats.totais.concluidas / stats.totais.total) * 100)
      : 0;

  const secretarias = stats.por_secretaria.map((s) => ({
    ...s,
    rotulo: s.sigla || s.nome,
  }));
  const meses = stats.por_mes.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) }));
  const status = stats.por_status.map((s) => ({
    ...s,
    nome: STATUS_LABEL[s.status] ?? s.status,
  }));
  const tipos = stats.por_tipo.map((t) => ({
    ...t,
    nome: TIPO_LABEL[t.tipo] ?? t.tipo,
  }));

  const STATUS_COLORS: Record<string, string> = {
    Abertas: "var(--brusque-red)",
    "Em andamento": "var(--brusque-gold)",
    Concluídas: "var(--brusque-green)",
  };
  const TIPO_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

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
      <div className="mx-auto max-w-[1400px] px-4 py-6 space-y-4">
        <header className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/80 shadow-lg shadow-black/20 px-5 py-4">
          <img
            src="/logo-brusque.png"
            alt="Prefeitura de Brusque"
            className="h-14 w-auto object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">
              Painel Analítico da Ouvidoria
            </h1>
            <p className="text-sm text-muted-foreground">
              Prefeitura Municipal de Brusque — indicadores agregados, sem dados
              individuais de manifestações
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-xs text-muted-foreground tabular-nums">
              Atualizado em{" "}
              {new Date(stats.gerado_em).toLocaleString("pt-BR")}
            </span>
            <button
              type="button"
              onClick={atualizar}
              disabled={atualizando}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total de manifestações"
            value={stats.totais.total}
            sub="desde o início do sistema"
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel
            title="Evolução mensal"
            icon={<TrendingUp className="h-4 w-4" />}
            className="lg:col-span-2 h-[320px]"
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
            title="Situação geral"
            icon={<PieChartIcon className="h-4 w-4" />}
            className="h-[320px]"
          >
            {status.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={status}
                        dataKey="total"
                        nameKey="nome"
                        innerRadius="55%"
                        outerRadius="85%"
                        paddingAngle={3}
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {status.map((s) => (
                          <Cell key={s.nome} fill={STATUS_COLORS[s.nome] ?? "var(--chart-4)"} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
                  {status.map((s) => (
                    <span key={s.nome} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: STATUS_COLORS[s.nome] ?? "var(--chart-4)" }}
                      />
                      {s.nome}: <strong className="text-foreground tabular-nums">{s.total}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel
            title="Manifestações por secretaria"
            icon={<BarChart3 className="h-4 w-4" />}
            className="lg:col-span-2 min-h-[360px]"
          >
            {secretarias.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, secretarias.length * 42)}>
                <BarChart
                  data={secretarias}
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
                    dataKey="rotulo"
                    width={110}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="total" name="Manifestações" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={18} />
                  <Bar dataKey="concluidas" name="Concluídas" fill="var(--brusque-green)" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel
            title="Por tipo de manifestação"
            icon={<Activity className="h-4 w-4" />}
            className="min-h-[360px]"
          >
            {tipos.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="h-full flex flex-col justify-center gap-4">
                {tipos.map((t, i) => {
                  const pct = stats.totais.total > 0 ? (t.total / stats.totais.total) * 100 : 0;
                  return (
                    <div key={t.tipo}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-medium">{t.nome}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          <strong className="text-foreground">{t.total}</strong> ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: TIPO_COLORS[i % TIPO_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel
            title="Regiões com mais manifestações"
            icon={<MapPin className="h-4 w-4" />}
            className="lg:col-span-2 min-h-[320px]"
          >
            {stats.por_local.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(220, stats.por_local.length * 36)}
              >
                <BarChart
                  data={stats.por_local}
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
                    width={150}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="total" name="Manifestações" fill="var(--chart-2)" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel
            title="Ranking de demandas"
            icon={<Clock className="h-4 w-4" />}
            className="min-h-[320px]"
          >
            {secretarias.length === 0 ? (
              <EmptyState />
            ) : (
              <ol className="h-full flex flex-col justify-center gap-2.5">
                {secretarias.slice(0, 8).map((s, i) => (
                  <li key={s.nome} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums ${
                        i === 0
                          ? "bg-brusque-red/20 text-brusque-red"
                          : i < 3
                            ? "bg-brusque-gold/20 text-brusque-gold"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{s.nome}</span>
                    <span className="text-sm font-bold tabular-nums">{s.total}</span>
                  </li>
                ))}
              </ol>
            )}
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
