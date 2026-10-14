import { urlValida1doc } from "@/lib/url-1doc";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ouvidorias from "@/data/ouvidorias.json";
import { supabase } from "@/integrations/supabase/client";
import {
  getOverride,
  setOverride,
  clearOverride,
  SITUACOES_DISPONIVEIS,
  type Override,
} from "@/lib/ouvidoriaOverrides";


type OuvidoriaRecord = {
  source: string;
  setor: string | null;
  responsavel: string | null;
  data: string;
  numero: number;
  situacao: string;
  comentario?: string | null;
};

const ALL = ouvidorias as OuvidoriaRecord[];

export const Route = createFileRoute("/_authenticated/protocolos-antigos/$source/$numero")({
  head: ({ params }) => ({
    meta: [
      { property: "og:title", content: "Protocolos antigos | Controle SETA" },
      { property: "og:description", content: "Protocolos antigos da Ouvidoria Municipal de Brusque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: `Ouvidoria #${params.numero} — ${params.source}` },
      { name: "description", content: `Detalhes da ouvidoria ${params.numero} (${params.source}).` },
    ],
  }),
  loader: ({ params }): OuvidoriaRecord => {
    const r = ALL.find(
      (x) => x.source === decodeURIComponent(params.source) && x.numero === Number(params.numero)
    );
    if (!r) throw notFound();
    return r;
  },
  component: Detail,
  notFoundComponent: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-900">Ouvidoria não encontrada</h1>
        <Link to="/protocolos-antigos" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          ← Voltar ao painel
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-red-600">Erro: {error instanceof Error ? error.message : String(error)}</div>
  ),
});

function Detail() {
  const loaded = Route.useLoaderData();
  const base = loaded as unknown as OuvidoriaRecord;

  const [override, setOverrideState] = useState<Override | undefined>(undefined);
  useEffect(() => {
    setOverrideState(getOverride(base.source, base.numero));
  }, [base.source, base.numero]);

  const [conclusao, setConclusao] = useState<{ url: string | null; data_conclusao: string | null } | null>(null);
  useEffect(() => {
    const ano = Number((base.data || "").slice(0, 4));
    if (!ano) return;
    supabase
      .from("protocolos_antigos_conclusoes")
      .select("url, data_conclusao")
      .eq("source", base.source)
      .eq("numero", base.numero)
      .eq("ano", ano)
      .maybeSingle()
      .then(({ data }) => setConclusao(data ?? null));
  }, [base.source, base.numero, base.data]);

  const r = { ...base, situacao: override?.situacao ?? base.situacao };
  const atrasada = r.situacao !== "Em dia";

  const related = ALL.filter(
    (x) => x.setor === base.setor && x.source === base.source && x.numero !== base.numero
  )
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, 8);

  const dataFmt = new Date(base.data).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const [editSituacao, setEditSituacao] = useState<string>(r.situacao);
  const [editNotas, setEditNotas] = useState<string>(override?.notas ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setEditSituacao(override?.situacao ?? base.situacao);
    setEditNotas(override?.notas ?? "");
  }, [override, base.situacao]);

  function handleSave() {
    setOverride(base.source, base.numero, { situacao: editSituacao, notas: editNotas });
    setOverrideState(getOverride(base.source, base.numero));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    clearOverride(base.source, base.numero);
    setOverrideState(undefined);
    setEditSituacao(base.situacao);
    setEditNotas("");
  }

  const isDirty =
    editSituacao !== (override?.situacao ?? base.situacao) ||
    editNotas !== (override?.notas ?? "");

  return (
    <div className="space-y-6">
      <Link to="/protocolos-antigos" className="text-sm text-slate-500 hover:text-slate-900">
        ← Voltar ao painel
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded px-2 py-0.5 font-medium ${r.source === "Saúde" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>{r.source}</span>
              <span className={`rounded px-2 py-0.5 font-medium ${atrasada ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{r.situacao}</span>
              {override?.situacao && override.situacao !== base.situacao && (
                <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">editado (era: {base.situacao})</span>
              )}
              {conclusao?.data_conclusao && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                  ✓ Concluído em {new Date(conclusao.data_conclusao).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">Ouvidoria nº {r.numero}</h1>
            <p className="mt-1 text-sm capitalize text-slate-500">{dataFmt}</p>
            {urlValida1doc(conclusao?.url) && (
              <a href={urlValida1doc(conclusao?.url)!} target="_blank" rel="noreferrer"
                 className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline">
                Abrir no 1doc ↗
              </a>
            )}
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-medium ${atrasada ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>
            {atrasada ? "⚠ Atrasada" : "✓ Em dia"}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Atualizar protocolo</h2>
            <p className="text-xs text-slate-500">Altere a situação e registre observações internas. As alterações ficam salvas neste navegador.</p>
          </div>
          {override?.updatedAt && (
            <span className="text-[11px] text-slate-400">Última alteração: {new Date(override.updatedAt).toLocaleString("pt-BR")}</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block text-xs font-medium text-slate-600 md:col-span-1">
            <span className="mb-1 block">Situação</span>
            <select value={editSituacao} onChange={(e) => setEditSituacao(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline focus:outline-2 focus:outline-indigo-500">
              {Array.from(new Set([...SITUACOES_DISPONIVEIS, base.situacao, r.situacao])).filter(Boolean).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600 md:col-span-2">
            <span className="mb-1 block">Anotações internas</span>
            <textarea value={editNotas} onChange={(e) => setEditNotas(e.target.value)} rows={3} placeholder="Ex.: cobrei retorno do setor em 10/06, aguardando resposta…" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline focus:outline-2 focus:outline-indigo-500" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {saved && <span className="text-xs text-emerald-600">✓ Salvo</span>}
          {override && (
            <button onClick={handleReset} className="rounded border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">Restaurar planilha</button>
          )}
          <button onClick={handleSave} disabled={!isDirty} className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">Salvar alterações</button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Info label="Setor responsável" value={r.setor ?? "—"} />
        <Info label="Responsável" value={r.responsavel ?? "—"} />
        <Info label="Data de abertura" value={new Date(r.data).toLocaleDateString("pt-BR")} />
        <Info label="Origem" value={r.source} />
        <Info label="Número (1Doc)" value={String(r.numero)} />
        <Info label="Situação atual" value={r.situacao} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-700">Conteúdo da manifestação</h2>
        {r.comentario ? (
          <div className="mt-3 space-y-3">
            {parseComentario(r.comentario).map((entry, i) => (
              <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                {(entry.autor || entry.quando) && (
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {entry.autor && (<span className="font-medium text-slate-700">{entry.autor}</span>)}
                    {entry.quando && <span>· {entry.quando}</span>}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-slate-800">{entry.texto}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Esta ouvidoria não possui comentário registrado na planilha. Consulte o sistema 1Doc utilizando o número{" "}
            <span className="font-medium text-slate-800">{r.numero}</span>.
          </p>
        )}
      </section>

      {related.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Outras ouvidorias do setor {r.setor}</h2>
          <ul className="divide-y divide-slate-100">
            {related.map((x) => (
              <li key={x.numero}>
                <Link to="/protocolos-antigos/$source/$numero" params={{ source: x.source, numero: String(x.numero) }} className="flex items-center justify-between py-2 text-sm hover:bg-slate-50">
                  <span className="tabular-nums text-slate-700">#{x.numero}</span>
                  <span className="text-slate-500">{new Date(x.data).toLocaleDateString("pt-BR")}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${x.situacao === "Em dia" ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700"}`}>{x.situacao}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

type ComentarioEntry = { autor: string; quando: string; texto: string };

function parseComentario(raw: string): ComentarioEntry[] {
  const blocks = raw.split(/\n?={3,}\n?/).map((b) => b.trim()).filter(Boolean);
  const entries: ComentarioEntry[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    let idx = 0;
    if (lines[idx]?.trim().startsWith("ID#")) idx++;
    let autor = "";
    let quando = "";
    const headerMatch = lines[idx]?.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (headerMatch) {
      autor = headerMatch[1].trim();
      quando = headerMatch[2].trim();
      idx++;
    }
    const texto = lines.slice(idx).join("\n").trim();
    if (texto || autor) entries.push({ autor, quando, texto });
  }
  return entries.length ? entries : [{ autor: "", quando: "", texto: raw }];
}