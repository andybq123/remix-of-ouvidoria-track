import { fetchAllPaginated } from "@/lib/fetch-all";
import { estavaAtrasadoNaData } from "@/lib/prazo";
import type { OnedocContexto } from "@/lib/onedoc-history";

/**
 * Seleção de ouvidorias atrasadas para a integração Muse, no servidor.
 *
 * Reusa a regra de prazo de src/lib/prazo.ts (ouvidoria: 30 dias, +30 se
 * prorrogada; atrasada = prazo final já passou e ainda não concluída),
 * a mesma conta que a tela Atrasados aplica com estavaAtrasadoNaData.
 * Nada aqui conclui protocolo: só lista e classifica.
 */

export type ProtocoloAtrasadoRow = {
  id: string;
  numero: string;
  tipo: string | null;
  status: string | null;
  data_abertura: string;
  prorrogado: boolean | null;
  url: string | null;
  secretaria_id: string | null;
  secretarias?: { nome: string | null } | null;
};

export type AtrasadaMuse = {
  id: string;
  numero: string;
  secretaria: string;
  dataAbertura: string;
  prazoFinal: string;
  diasAtraso: number;
  prorrogado: boolean;
  url: string | null;
};

export type SelecaoAtrasadas = {
  /** Atrasadas com link do 1Doc — as únicas que o agente consegue conferir. */
  elegiveis: AtrasadaMuse[];
  /** Atrasadas sem link do 1Doc (o agente não consegue conferir). */
  semLink: number;
  /** Todas as atrasadas (elegíveis + sem link). */
  totalAtrasadas: number;
  /** Secretarias das elegíveis, no formato do contexto do job. */
  secretarias: NonNullable<import("@/lib/onedoc-history").OnedocContexto["secretarias"]>;
};

function dataIsoLocal(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function isAtrasadaVencida(
  row: ProtocoloAtrasadoRow,
  refDate: Date = new Date(),
): { atrasada: boolean; prazoFinal: Date; diasAtraso: number } {
  if (row.tipo !== "ouvidoria" || row.status === "concluido" || !row.data_abertura) {
    return { atrasada: false, prazoFinal: new Date(0), diasAtraso: 0 };
  }
  const r = estavaAtrasadoNaData(
    {
      tipo: "ouvidoria",
      data_abertura: row.data_abertura,
      prorrogado: !!row.prorrogado,
      status: row.status as "aberto" | "em_andamento" | "concluido",
      data_conclusao: null,
    },
    refDate,
  );
  return { atrasada: r.atrasado, prazoFinal: r.prazoFinal, diasAtraso: r.diasAtraso };
}

/** Classifica linhas já buscadas do banco em elegíveis / sem link. */
export function classificarAtrasadas(
  rows: readonly ProtocoloAtrasadoRow[],
  refDate: Date = new Date(),
): SelecaoAtrasadas {
  const atrasadas: AtrasadaMuse[] = [];
  for (const row of rows) {
    const { atrasada, prazoFinal, diasAtraso } = isAtrasadaVencida(row, refDate);
    if (!atrasada) continue;
    atrasadas.push({
      id: row.id,
      numero: row.numero,
      secretaria: row.secretarias?.nome ?? "Sem secretaria",
      dataAbertura: row.data_abertura,
      prazoFinal: dataIsoLocal(prazoFinal),
      diasAtraso,
      prorrogado: !!row.prorrogado,
      url: row.url ?? null,
    });
  }
  const elegiveis = atrasadas.filter((a) => /1doc/i.test(a.url ?? ""));
  const secretarias = new Map<string | null, { id: string | null; nome: string }>();
  for (const row of rows) {
    if (!elegiveis.some((e) => e.id === row.id)) continue;
    secretarias.set(row.secretaria_id, {
      id: row.secretaria_id,
      nome: row.secretarias?.nome ?? "Sem secretaria",
    });
  }
  return {
    elegiveis,
    semLink: atrasadas.length - elegiveis.length,
    totalAtrasadas: atrasadas.length,
    secretarias: [...secretarias.values()],
  };
}

// Cliente Supabase (admin) passado pelos chamadores; o builder encadeado
// (select/eq/order/range/in) não tem tipo estrutural simples neste repo.
type SupabaseAdminLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabela: string) => any;
};

const SELECT_ATRASADAS =
  "id,numero,tipo,status,data_abertura,prorrogado,url,secretaria_id,secretarias(nome)";

/** Lista atrasadas (vencidas hoje) direto do banco, com limite. */
export async function listarAtrasadasMuse(
  client: SupabaseAdminLike,
  opts: { secretariaId?: string; limite?: number; refDate?: Date } = {},
): Promise<SelecaoAtrasadas> {
  const limite = Math.min(Math.max(opts.limite ?? 5000, 1), 5000);
  const rows = await fetchAllPaginated<ProtocoloAtrasadoRow>((from, to) => {
    let query = client
      .from("protocolos")
      .select(SELECT_ATRASADAS)
      .eq("tipo", "ouvidoria")
      .neq("status", "concluido")
      .order("data_abertura", { ascending: false });
    if (opts.secretariaId) query = query.eq("secretaria_id", opts.secretariaId);
    return query.range(from, to);
  });
  const sel = classificarAtrasadas(rows, opts.refDate ?? new Date());
  return { ...sel, elegiveis: sel.elegiveis.slice(0, limite) };
}

/**
 * Valida uma lista explícita de IDs (a que o Muse viu em GET /atrasadas)
 * contra o banco, em blocos de 100 como enfileirarOnedoc faz.
 * Só voltam as atrasadas com link do 1Doc; o resto é ignorado.
 */
export async function selecionarPorIdsMuse(
  client: SupabaseAdminLike,
  ids: readonly string[],
  opts: { secretariaId?: string; refDate?: Date } = {},
): Promise<{
  elegiveis: AtrasadaMuse[];
  semLink: number;
  secretarias: NonNullable<OnedocContexto["secretarias"]>;
}> {
  const unicos = [...new Set(ids)];
  const rows: ProtocoloAtrasadoRow[] = [];
  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100);
    let query = client.from("protocolos").select(SELECT_ATRASADAS).in("id", lote);
    if (opts.secretariaId) query = query.eq("secretaria_id", opts.secretariaId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  const sel = classificarAtrasadas(rows, opts.refDate ?? new Date());
  const secretarias = new Map<string | null, { id: string | null; nome: string }>();
  for (const row of rows) {
    if (!sel.elegiveis.some((e) => e.id === row.id)) continue;
    secretarias.set(row.secretaria_id, {
      id: row.secretaria_id,
      nome: row.secretarias?.nome ?? "Sem secretaria",
    });
  }
  return {
    elegiveis: sel.elegiveis,
    semLink: sel.semLink,
    secretarias: [...secretarias.values()],
  };
}

/** Secretarias das atrasadas elegíveis, no formato do contexto do job. */
export function secretariasDaSelecao(
  rows: readonly ProtocoloAtrasadoRow[],
  elegiveis: readonly AtrasadaMuse[],
): NonNullable<OnedocContexto["secretarias"]> {
  const mapa = new Map<string | null, { id: string | null; nome: string }>();
  for (const row of rows) {
    if (!elegiveis.some((e) => e.id === row.id)) continue;
    mapa.set(row.secretaria_id, {
      id: row.secretaria_id,
      nome: row.secretarias?.nome ?? "Sem secretaria",
    });
  }
  return [...mapa.values()];
}

/**
 * Flag "Pausar integração" do painel Ouvidorizinho, guardada em
 * onedoc_config.muse_pausado (migração 0034/035). Sem a coluna (banco
 * ainda não atualizado na VPS), considera desligada em vez de quebrar.
 */
export async function musePausado(client: SupabaseAdminLike): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("onedoc_config")
      .select("muse_pausado")
      .eq("id", true)
      .maybeSingle();
    if (error) return false;
    return data?.muse_pausado === true;
  } catch {
    return false;
  }
}
