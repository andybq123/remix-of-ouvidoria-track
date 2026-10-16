import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  importarProtocolosAntigos,
  reverterImportacaoAntigos,
  contarProtocolosAntigosImportados,
} from "@/lib/protocolos-antigos-import.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import ouvidorias from "@/data/ouvidorias.json";
import atrasadasOficiais from "@/data/ouvidorias-atrasadas.json";
import { getAllOverrides } from "@/lib/ouvidoriaOverrides";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";



type Record = {
  source: string;
  setor: string | null;
  responsavel: string | null;
  data: string;
  numero: number;
  situacao: string;
  comentario?: string | null;
};

// Remove manifestações de junho/2026 dos protocolos antigos (duplicavam dados atuais).
const ALL = (ouvidorias as Record[]).filter((r) => !r.data?.startsWith("2026-06"));

// Conjunto oficial de atrasadas extraído das abas "Ouvidorias atrasadas" das planilhas (Brusque + Saúde).
const ATRASADAS_SET = new Set<string>(
  (atrasadasOficiais as { source: string; numero: number }[]).map(
    (r) => `${r.source}|${r.numero}`
  )
);
const isAtrasada = (r: Pick<Record, "source" | "numero">) =>
  ATRASADAS_SET.has(`${r.source}|${r.numero}`);

export const Route = createFileRoute("/_authenticated/protocolos-antigos/")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Protocolos antigos | Seta360" },
      { property: "og:description", content: "Protocolos antigos da Ouvidoria Municipal de Brusque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Protocolos Antigos — Ouvidorias" },
      {
        name: "description",
        content:
          "Consolidação histórica de protocolos de ouvidoria. Filtre por data, setor, conteúdo e situação.",
      },
    ],
  }),
  component: Dashboard,
});

type Tab = "Saúde" | "Outros" | "Todos";

function ImportacaoControls() {
  const importar = useServerFn(importarProtocolosAntigos);
  const reverter = useServerFn(reverterImportacaoAntigos);
  const contar = useServerFn(contarProtocolosAntigosImportados);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState<null | "import" | "revert">(null);

  useEffect(() => {
    contar().then((r) => setTotal(r.total)).catch(() => setTotal(null));
  }, []);

  async function refresh() {
    try {
      const r = await contar();
      setTotal(r.total);
    } catch { /* noop */ }
  }

  async function handleImport() {
    setLoading("import");
    try {
      const r = await importar();
      toast.success(
        `Importados ${r.inseridos} protocolos (${r.pulados_duplicados} já existiam, ${r.pulados_junho} de jun/2026 ignorados).`,
      );
      if (r.erros?.length) toast.error(`Erros em lotes: ${r.erros.join("; ")}`);
      await refresh();
    } catch (e: any) {
      toast.error(`Falha ao importar: ${e?.message ?? e}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleRevert() {
    setLoading("revert");
    try {
      const r = await reverter();
      toast.success(`Removidos ${r.removidos} protocolos legados.`);
      await refresh();
    } catch (e: any) {
      toast.error(`Falha ao reverter: ${e?.message ?? e}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="text-xs text-slate-500">
        Legados no banco: <strong>{total ?? "—"}</strong>
      </div>
      <div className="flex gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={loading !== null || ALL.length === 0}>
              {loading === "import" ? "Importando..." : "Importar para protocolos"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Importar protocolos antigos?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso inserirá os registros históricos na tabela principal de protocolos, respeitando o mesmo padrão de numeração. Duplicatas serão ignoradas. A operação é reversível.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleImport}>Importar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={loading !== null || (total ?? 0) === 0}>
              {loading === "revert" ? "Revertendo..." : "Reverter importação"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reverter importação?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os protocolos com origem "antigo:*" serão apagados do sistema. Esta ação não afeta o JSON histórico exibido aqui.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleRevert}>Reverter</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Todos");
  const [setor, setSetor] = useState<string>("Todos");
  const [situacao, setSituacao] = useState<string>("Todos");
  const [quick, setQuick] = useState<"todas" | "atrasadas" | "emDia">("todas");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [sortBy, setSortBy] = useState<keyof Record>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(100);

  const [overridesVer, setOverridesVer] = useState(0);
  useEffect(() => {
    const handler = () => setOverridesVer((v) => v + 1);
    window.addEventListener("ouvidoria-overrides-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("ouvidoria-overrides-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const merged = useMemo(() => {
    const ov = getAllOverrides();
    return ALL.map((r) => {
      const o = ov[`${r.source}|${r.numero}`];
      return o?.situacao ? { ...r, situacao: o.situacao } : r;
    });
  }, [overridesVer]);

  const scoped = useMemo(() => {
    if (tab === "Saúde") return merged.filter((r) => r.source === "Saúde");
    if (tab === "Outros") return merged.filter((r) => r.source !== "Saúde");
    return merged;
  }, [tab, merged]);

  const setores = useMemo(() => {
    const set = new Set<string>();
    scoped.forEach((r) => r.setor && set.add(r.setor));
    return ["Todos", ...Array.from(set).sort()];
  }, [scoped]);

  const situacoes = useMemo(() => {
    const set = new Set<string>();
    scoped.forEach((r) => set.add(r.situacao));
    return ["Todos", ...Array.from(set).sort()];
  }, [scoped]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let rows = scoped.filter((r) => {
      if (setor !== "Todos" && r.setor !== setor) return false;
      if (situacao !== "Todos" && r.situacao !== situacao) return false;
      if (quick === "atrasadas" && !isAtrasada(r)) return false;
      if (quick === "emDia" && isAtrasada(r)) return false;
      if (from && r.data < from) return false;
      if (to && r.data > to) return false;
      if (ql) {
        const hay = `${r.setor ?? ""} ${r.responsavel ?? ""} ${r.numero} ${r.source} ${r.comentario ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const av = (a[sortBy] ?? "") as string | number;
      const bv = (b[sortBy] ?? "") as string | number;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [scoped, setor, situacao, quick, from, to, q, sortBy, sortDir]);

  const counts = useMemo(() => {
    const saude = ALL.filter((r) => r.source === "Saúde").length;
    const outros = ALL.length - saude;
    return { saude, outros, todos: ALL.length };
  }, []);

  const kpis = useMemo(() => {
    const total = scoped.length;
    const atrasadas = scoped.filter((r) => isAtrasada(r)).length;
    const emDia = total - atrasadas;
    const setoresUnicos = new Set(scoped.map((r) => r.setor ?? "—")).size;
    return { total, atrasadas, emDia, setoresUnicos };
  }, [scoped]);

  const bySetor = useMemo(() => {
    const m = new Map<string, { total: number; atrasadas: number }>();
    filtered.forEach((r) => {
      const k = r.setor ?? "—";
      const cur = m.get(k) ?? { total: 0, atrasadas: 0 };
      cur.total++;
      if (isAtrasada(r)) cur.atrasadas++;
      m.set(k, cur);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const m = new Map<string, { total: number; emDia: number; atrasadas: number }>();
    filtered.forEach((r) => {
      const k = r.data.slice(0, 7);
      const cur = m.get(k) ?? { total: 0, emDia: 0, atrasadas: 0 };
      cur.total++;
      if (isAtrasada(r)) cur.atrasadas++;
      else cur.emDia++;
      m.set(k, cur);
    });
    return Array.from(m.entries()).sort();
  }, [filtered]);

  const bySituacao = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => m.set(r.situacao, (m.get(r.situacao) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const periodo = useMemo(() => {
    if (filtered.length === 0) return null;
    const datas = filtered.map((r) => r.data).sort();
    return { de: datas[0], ate: datas[datas.length - 1] };
  }, [filtered]);

  const maxSetor = Math.max(1, ...bySetor.map((x) => x[1].total));
  const maxMonth = Math.max(1, ...byMonth.map((x) => x[1].total));
  const totalSit = Math.max(1, bySituacao.reduce((s, [, v]) => s + v, 0));

  function toggleSort(col: keyof Record) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  function exportCSV() {
    const headers = ["source", "data", "setor", "responsavel", "numero", "situacao"];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      lines.push(
        headers
          .map((h) => {
            const v = String((r as never as Record)[h as keyof Record] ?? "");
            return `"${v.replace(/"/g, '""')}"`;
          })
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ouvidorias-${tab.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabAccent: { [K in Tab]: string } = {
    Saúde: "emerald",
    Outros: "indigo",
    Todos: "slate",
  };
  const accent = tabAccent[tab];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Protocolos Antigos — Ouvidorias
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Consolidação de {ALL.length.toLocaleString("pt-BR")} registros históricos de ouvidoria para exportação e análise.
            </p>
          </div>
          <ImportacaoControls />
        </div>
        {ALL.length === 0 && <p className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">Não há planilhas antigas embutidas nesta versão. Para carregar seus dados, use Configurações → Backup e importe seu arquivo. Os registros importados aparecerão em Protocolos e Relatórios.</p>}
      </div>

      <section className="grid grid-cols-3 gap-3">
        <TabCard label="Saúde" sub="Secretaria de Saúde" value={counts.saude} active={tab === "Saúde"} color="emerald"
          onClick={() => { setTab("Saúde"); setSetor("Todos"); setSituacao("Todos"); setQuick("todas"); setLimit(100); }} />
        <TabCard label="Outros protocolos" sub="Demais secretarias" value={counts.outros} active={tab === "Outros"} color="indigo"
          onClick={() => { setTab("Outros"); setSetor("Todos"); setSituacao("Todos"); setQuick("todas"); setLimit(100); }} />
        <TabCard label="Todos" sub="Visão consolidada" value={counts.todos} active={tab === "Todos"} color="slate"
          onClick={() => { setTab("Todos"); setSetor("Todos"); setSituacao("Todos"); setQuick("todas"); setLimit(100); }} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`Total em ${tab}`} value={kpis.total} accent={accent} active={quick === "todas"} onClick={() => setQuick("todas")} hint="Mostrar todas" />
        <Kpi label="Em dia" value={kpis.emDia} tone="green" active={quick === "emDia"} onClick={() => setQuick(quick === "emDia" ? "todas" : "emDia")} hint="Filtrar somente em dia" />
        <Kpi label="Atrasadas" value={kpis.atrasadas} tone="red" active={quick === "atrasadas"} onClick={() => setQuick(quick === "atrasadas" ? "todas" : "atrasadas")} hint="Ver as atrasadas" />
        <Kpi label="Setores envolvidos" value={kpis.setoresUnicos} />
      </section>

      {quick !== "todas" && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>
            Exibindo apenas <strong>{quick === "atrasadas" ? "ouvidorias atrasadas" : "ouvidorias em dia"}</strong> de <strong>{tab}</strong> — {filtered.length.toLocaleString("pt-BR")} registros.
          </span>
          <button onClick={() => setQuick("todas")} className="rounded border border-amber-300 bg-white px-2 py-1 text-xs hover:bg-amber-100">Limpar</button>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Field label="Setor">
            <select className="oa-select" value={setor} onChange={(e) => setSetor(e.target.value)}>
              {setores.map((o) => (<option key={o}>{o}</option>))}
            </select>
          </Field>
          <Field label="Situação">
            <select className="oa-select" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              {situacoes.map((o) => (<option key={o}>{o}</option>))}
            </select>
          </Field>
          <Field label="De">
            <input type="date" className="oa-select" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Até">
            <input type="date" className="oa-select" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Buscar (setor, conteúdo, nº)">
            <input className="oa-select" placeholder="ex.: 1Doc 1878, Atenção Básica…" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>{filtered.length.toLocaleString("pt-BR")} resultados em <strong className="text-slate-700">{tab}</strong></span>
          <div className="flex gap-2">
            <button onClick={() => { setSetor("Todos"); setSituacao("Todos"); setFrom(""); setTo(""); setQ(""); }} className="rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50">Limpar filtros</button>
            <button onClick={exportCSV} className="rounded bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700">Exportar CSV</button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Top 10 setores" className="lg:col-span-2"
          subtitle={periodo ? `${fmtDate(periodo.de)} → ${fmtDate(periodo.ate)}` : undefined}
          legend={<><LegendItem color="bg-slate-500" label="Em dia" /><LegendItem color="bg-red-500" label="Atrasadas" /></>}>
          <div className="space-y-2.5">
            {bySetor.map(([name, v]) => {
              const pct = (v.total / maxSetor) * 100;
              const atrPct = v.total ? (v.atrasadas / v.total) * 100 : 0;
              const emDia = v.total - v.atrasadas;
              const tip = `Setor: ${name}\nTotal: ${v.total}\nEm dia: ${emDia}\nAtrasadas: ${v.atrasadas} (${atrPct.toFixed(0)}%)${periodo ? `\nPeríodo: ${fmtDate(periodo.de)} – ${fmtDate(periodo.ate)}` : ""}`;
              return (
                <div key={name} className="group relative text-sm" title={tip}>
                  <div className="flex justify-between text-slate-600">
                    <span className="truncate pr-2">{name}</span>
                    <span className="tabular-nums">
                      <span className="text-slate-700">{v.total}</span>
                      {v.atrasadas > 0 && (<span className="ml-2 text-xs text-red-600">{v.atrasadas} atrasadas ({atrPct.toFixed(0)}%)</span>)}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded bg-slate-100">
                    <div className="h-full bg-slate-500 relative transition-opacity group-hover:opacity-90" style={{ width: `${pct}%` }}>
                      <div className="absolute right-0 top-0 h-full bg-red-500" style={{ width: `${atrPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {bySetor.length === 0 && <p className="text-sm text-slate-400">Sem dados.</p>}
          </div>
        </Card>

        <Card title="Situação" subtitle={`${kpis.total.toLocaleString("pt-BR")} registros em ${tab}`}
          legend={<><LegendItem color="bg-emerald-500" label="Em dia" /><LegendItem color="bg-red-500" label="Atrasadas" /></>}>
          <div className="space-y-2">
            {bySituacao.map(([s, v]) => {
              const pct = (v / totalSit) * 100;
              const isOk = s === "Em dia";
              const tip = `Situação: ${s}\nQuantidade: ${v}\nParticipação: ${pct.toFixed(1)}%${periodo ? `\nPeríodo: ${fmtDate(periodo.de)} – ${fmtDate(periodo.ate)}` : ""}`;
              return (
                <div key={s} className="text-sm" title={tip}>
                  <div className="flex justify-between">
                    <span className="truncate pr-2 text-slate-700">{s}</span>
                    <span className="tabular-nums text-slate-500">{v} <span className="text-xs">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-slate-100">
                    <div className={`h-full rounded ${isOk ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {bySituacao.length === 0 && <p className="text-sm text-slate-400">Sem dados.</p>}
          </div>
        </Card>
      </section>

      <section>
        <Card title="Volume por mês" subtitle="Manifestações mensais — em dia vs atrasadas"
          legend={<><LegendItem color="bg-emerald-500" label="Em dia" /><LegendItem color="bg-red-500" label="Atrasadas" /></>}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byMonth.map(([m, v]) => ({
                  mes: fmtMonth(m),
                  emDia: v.emDia,
                  atrasadas: v.atrasadas,
                  total: v.total,
                }))}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 232 240)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="rgb(100 116 139)" />
                <YAxis tick={{ fontSize: 11 }} stroke="rgb(100 116 139)" allowDecimals={false} />
                <Tooltip
                  content={(props: any) => {
                    if (!props.active || !props.payload?.length) return null;
                    const renamed = props.payload.map((p: any) => ({
                      ...p,
                      name: p.dataKey === "emDia" ? "Em dia" : "Atrasadas",
                    }));
                    return (
                      <ChartTooltipContent
                        {...props}
                        payload={renamed}
                        label={`Mês: ${props.label}`}
                        unit="protocolo(s)"
                      />
                    );
                  }}
                  cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) => (value === "emDia" ? "Em dia" : "Atrasadas")}
                />
                <Bar dataKey="emDia" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                <Bar dataKey="atrasadas" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {([
                  ["data", "Data"],
                  ["source", "Origem"],
                  ["setor", "Setor"],
                  ["responsavel", "Responsável"],
                  ["numero", "Nº"],
                  ["situacao", "Situação"],
                ] as [keyof Record, string][]).map(([k, label]) => (
                  <th key={k} onClick={() => toggleSort(k)} className="cursor-pointer px-3 py-2 hover:text-slate-900">
                    {label}{sortBy === k && (sortDir === "asc" ? " ▲" : " ▼")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, limit).map((r, i) => (
                <tr
                  key={i}
                  onClick={() =>
                    navigate({
                      to: "/protocolos-antigos/$source/$numero",
                      params: { source: r.source, numero: String(r.numero) },
                    })
                  }
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-3 py-2 tabular-nums text-slate-700">
                    {new Date(r.data).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.source === "Saúde" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>{r.source}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.setor ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.responsavel ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    <span className="font-medium text-indigo-600">#{r.numero}</span>
                  </td>
                  <td className="px-3 py-2">
                    {isAtrasada(r) ? (
                      <span className="rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700">Atrasada</span>
                    ) : (
                      <span className="rounded px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">Em dia</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nenhum registro encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="border-t border-slate-200 p-3 text-center">
            <button onClick={() => setLimit(limit + 200)} className="rounded border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">
              Carregar mais ({filtered.length - limit} restantes)
            </button>
          </div>
        )}
      </section>

      <style>{`
        .oa-select {
          width: 100%;
          border: 1px solid rgb(226 232 240);
          border-radius: 0.375rem;
          padding: 0.5rem 0.625rem;
          font-size: 0.875rem;
          background: white;
        }
        .oa-select:focus { outline: 2px solid rgb(99 102 241); outline-offset: -1px; }
      `}</style>
    </div>
  );
}

function TabCard({ label, sub, value, active, color, onClick }: { label: string; sub: string; value: number; active: boolean; color: "emerald" | "indigo" | "slate"; onClick: () => void; }) {
  const ring = color === "emerald" ? "ring-emerald-500 bg-emerald-50" : color === "indigo" ? "ring-indigo-500 bg-indigo-50" : "ring-slate-700 bg-slate-100";
  const accent = color === "emerald" ? "text-emerald-700" : color === "indigo" ? "text-indigo-700" : "text-slate-800";
  return (
    <button onClick={onClick} className={`rounded-lg border bg-white p-4 text-left transition hover:shadow-sm ${active ? `border-transparent ring-2 ${ring}` : "border-slate-200"}`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-semibold ${active ? accent : "text-slate-700"}`}>{label}</span>
        <span className={`text-2xl font-semibold tabular-nums ${active ? accent : "text-slate-900"}`}>{value.toLocaleString("pt-BR")}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </button>
  );
}

function Kpi({ label, value, tone = "default", accent, active, onClick, hint }: { label: string; value: number; tone?: "default" | "red" | "green"; accent?: string; active?: boolean; onClick?: () => void; hint?: string; }) {
  const color = tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : accent === "emerald" ? "text-emerald-700" : accent === "indigo" ? "text-indigo-700" : "text-slate-900";
  const ring = tone === "red" ? "ring-red-500" : tone === "green" ? "ring-emerald-500" : "ring-slate-700";
  const base = `block w-full rounded-lg border bg-white p-4 text-left transition ${onClick ? "cursor-pointer hover:shadow-sm" : ""} ${active ? `border-transparent ring-2 ${ring}` : "border-slate-200"}`;
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        {onClick && (<span className="text-[10px] text-slate-400">{active ? "ativo ▲" : "clique →"}</span>)}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value.toLocaleString("pt-BR")}</div>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </>
  );
  if (onClick) return (<button type="button" onClick={onClick} className={base}>{inner}</button>);
  return <div className={base}>{inner}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Card({ title, children, className = "", subtitle, legend }: { title: string; children: React.ReactNode; className?: string; subtitle?: string; legend?: React.ReactNode; }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {legend && <div className="flex flex-wrap gap-3">{legend}</div>}
      </div>
      {children}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${MESES[idx]}/${y.slice(2)}`;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
