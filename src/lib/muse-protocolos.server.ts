import { fetchAllPaginated } from "@/lib/fetch-all";
import {
  calcularSla,
  categoriaPersistida,
  type StatusProtocolo,
  type TipoProtocolo,
} from "@/lib/prazo";
import { classificarAtrasadas, type ProtocoloAtrasadoRow } from "@/lib/muse-atrasadas.server";
import type { MuseEditarProtocoloBody } from "@/lib/muse-api.server";

/**
 * Leitura genérica de protocolos e edição auditada para a integração Muse.
 *
 * Reusa a regra de prazo de src/lib/prazo.ts (mesma conta da tela
 * Atrasados e do chat do Ouvidorzinho) e a seleção de atrasadas de
 * muse-atrasadas.server.ts, para os números baterem com os que o
 * painel já mostra. Nada aqui conclui, encerra ou arquiva protocolo:
 * a única escrita é o PATCH de campos seguros via RPC
 * aplicar_edicao_muse (migração 0036), auditada pelo trigger
 * log_protocolo_changes como qualquer edição do painel.
 */

// Cliente Supabase (admin) passado pelos chamadores; o builder encadeado
// (select/eq/order/range/maybeSingle/rpc) não tem tipo estrutural
// simples neste repo.
type SupabaseAdminLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabela: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): any;
};

export type ProtocoloMuseRow = {
  id: string;
  numero: string;
  tipo: string | null;
  categoria: string | null;
  assunto: string | null;
  descricao: string | null;
  status: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  secretaria_id: string | null;
  local_id: string | null;
  data_abertura: string;
  data_conclusao: string | null;
  prorrogado: boolean | null;
  resolucao: string | null;
  triagem_pendente: boolean | null;
  url: string | null;
  onedoc_situacao: string | null;
  onedoc_baixado_em: string | null;
  onedoc_arquivado_em: string | null;
  onedoc_verificado_em: string | null;
  secretarias?: { nome: string | null; sigla: string | null } | null;
};

/**
 * Formato público de um protocolo na API Muse. Não inclui solicitante
 * nem contato (PII): o job já nunca os expõe (sanitizarResultadoJob) e
 * a revisão de endereço não precisa deles. O endereço e a descrição
 * aparecem porque são o objeto da revisão: o "Local" de texto livre
 * fica dentro da descrição e NÃO é o endereço a gravar — o endereço
 * certo vem do bloco estruturado abaixo do mapa na página do 1Doc
 * (extrairEndereco, em parse.mjs) e, depois de uma conferência, já
 * está em `endereco`, com a data em `onedocVerificadoEm`.
 */
export type ProtocoloMuse = {
  id: string;
  numero: string;
  secretaria: string;
  secretariaId: string | null;
  status: string;
  /** vencido | critico | atencao | no_prazo | concluido (prazo.ts). */
  situacao: string;
  tipo: string;
  categoria: string | null;
  assunto: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  descricao: string | null;
  dataAbertura: string;
  dataConclusao: string | null;
  prazoFinal: string;
  /** Dias de atraso (>= 0). 0 quando não está atrasado ou já concluído. */
  diasAtraso: number;
  /** Dias restantes até o prazo final (negativo = atrasado). */
  diasRestantes: number;
  prorrogado: boolean;
  url: string | null;
  /** Última situação lida no 1Doc (baixada/arquivada/em_andamento). */
  onedocSituacao: string | null;
  onedocVerificadoEm: string | null;
  onedocBaixadoEm: string | null;
  onedocArquivadoEm: string | null;
};

function dataIsoLocal(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Mapeia uma linha do banco para o formato público. Null sem data/tipo válidos. */
export function mapearProtocoloMuse(
  row: ProtocoloMuseRow,
  refDate: Date = new Date(),
): ProtocoloMuse | null {
  const tipo = (row.tipo ?? "ouvidoria") as TipoProtocolo;
  if (tipo !== "ouvidoria" && tipo !== "lai" && tipo !== "esic") return null;
  if (!row.data_abertura) return null;
  const status = (row.status ?? "aberto") as StatusProtocolo;
  const sla = calcularSla(
    {
      tipo,
      data_abertura: row.data_abertura,
      prorrogado: !!row.prorrogado,
      status,
      data_conclusao: row.data_conclusao,
    },
    refDate,
  );
  return {
    id: row.id,
    numero: row.numero,
    secretaria: row.secretarias?.nome ?? "Sem secretaria",
    secretariaId: row.secretaria_id,
    status,
    situacao: sla.situacao,
    tipo,
    categoria: row.categoria ?? null,
    assunto: row.assunto ?? null,
    endereco: row.endereco ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    descricao: row.descricao ?? null,
    dataAbertura: row.data_abertura,
    dataConclusao: row.data_conclusao ?? null,
    prazoFinal: dataIsoLocal(sla.prazoFinal),
    diasAtraso: status === "concluido" || sla.dias >= 0 ? 0 : -sla.dias,
    diasRestantes: sla.dias,
    prorrogado: !!row.prorrogado,
    url: row.url ?? null,
    onedocSituacao: row.onedoc_situacao ?? null,
    onedocVerificadoEm: row.onedoc_verificado_em ?? null,
    onedocBaixadoEm: row.onedoc_baixado_em ?? null,
    onedocArquivadoEm: row.onedoc_arquivado_em ?? null,
  };
}

const SELECT_PROTOCOLOS =
  "id,numero,tipo,categoria,assunto,descricao,status,endereco,latitude,longitude,secretaria_id,local_id,data_abertura,data_conclusao,prorrogado,resolucao,triagem_pendente,url,onedoc_situacao,onedoc_baixado_em,onedoc_arquivado_em,onedoc_verificado_em,secretarias(nome,sigla)";

export type OrdemProtocolos = "abertura" | "prazo" | "atraso";

export type FiltrosProtocolosMuse = {
  secretariaId?: string;
  status?: StatusProtocolo;
  tipo?: TipoProtocolo;
  /** Só os não concluídos com prazo final em 0..7 dias (mesma conta do chat). */
  vencendo?: boolean;
  /** Número (com ou sem ponto, ex.: 3.768/2026) ou texto em assunto/descrição. */
  busca?: string;
  limite?: number;
  offset?: number;
  ordem?: OrdemProtocolos;
  refDate?: Date;
};

export type PaginaProtocolosMuse = {
  total: number;
  limite: number;
  offset: number;
  protocolos: ProtocoloMuse[];
};

/**
 * Classifica linhas já buscadas do banco: calcula prazo/situação,
 * aplica vencendo/busca, ordena e pagina. Pura — é o que os testes
 * cobrem sem banco.
 */
export function classificarProtocolos(
  rows: readonly ProtocoloMuseRow[],
  filtros: FiltrosProtocolosMuse,
  refDate: Date = new Date(),
): PaginaProtocolosMuse {
  const limite = Math.min(Math.max(filtros.limite ?? 50, 1), 500);
  const offset = Math.max(filtros.offset ?? 0, 0);
  const ordem = filtros.ordem ?? "abertura";
  let lista = rows
    .map((r) => mapearProtocoloMuse(r, refDate))
    .filter((p): p is ProtocoloMuse => !!p);

  if (filtros.vencendo) {
    lista = lista.filter(
      (p) => p.status !== "concluido" && p.diasRestantes >= 0 && p.diasRestantes <= 7,
    );
  }
  const termo = filtros.busca?.trim().toLowerCase();
  if (termo) {
    const variantes = new Set([termo]);
    const [n, ano] = termo.split("/");
    if (ano && n) {
      const semPonto = n.replace(/\./g, "");
      variantes.add(`${semPonto}/${ano}`);
      if (semPonto.length > 3) {
        variantes.add(`${semPonto.slice(0, -3)}.${semPonto.slice(-3)}/${ano}`);
      }
    }
    lista = lista.filter(
      (p) =>
        [...variantes].some((v) => p.numero.toLowerCase().includes(v)) ||
        (p.assunto ?? "").toLowerCase().includes(termo) ||
        (p.descricao ?? "").toLowerCase().includes(termo),
    );
  }

  const porAbertura = (a: ProtocoloMuse, b: ProtocoloMuse) =>
    a.dataAbertura < b.dataAbertura ? 1 : a.dataAbertura > b.dataAbertura ? -1 : 0;
  if (ordem === "prazo") {
    lista.sort(
      (a, b) =>
        a.prazoFinal < b.prazoFinal ? -1 : a.prazoFinal > b.prazoFinal ? 1 : porAbertura(a, b),
    );
  } else if (ordem === "atraso") {
    lista.sort((a, b) => b.diasAtraso - a.diasAtraso || porAbertura(a, b));
  } else {
    lista.sort(porAbertura);
  }

  return { total: lista.length, limite, offset, protocolos: lista.slice(offset, offset + limite) };
}

/** Lista protocolos com os filtros do Muse; secretaria/status/tipo vão no banco, o resto em memória. */
export async function listarProtocolosMuse(
  client: SupabaseAdminLike,
  filtros: FiltrosProtocolosMuse = {},
): Promise<PaginaProtocolosMuse> {
  const rows = await fetchAllPaginated<ProtocoloMuseRow>((from, to) => {
    let query = client
      .from("protocolos")
      .select(SELECT_PROTOCOLOS)
      .order("data_abertura", { ascending: false });
    if (filtros.secretariaId) query = query.eq("secretaria_id", filtros.secretariaId);
    if (filtros.status) query = query.eq("status", filtros.status);
    if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
    return query.range(from, to);
  });
  return classificarProtocolos(rows, filtros, filtros.refDate ?? new Date());
}

/** Detalhe de um protocolo por id. Null quando não existe. */
export async function buscarProtocoloMuse(
  client: SupabaseAdminLike,
  id: string,
  refDate: Date = new Date(),
): Promise<ProtocoloMuse | null> {
  const { data, error } = await client
    .from("protocolos")
    .select(SELECT_PROTOCOLOS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const row = data as ProtocoloMuseRow | null;
  if (!row) return null;
  return mapearProtocoloMuse(row, refDate);
}

export type SecretariaMuse = {
  id: string;
  nome: string;
  sigla: string | null;
};

/** Todas as secretarias (id, nome, sigla), por nome — para filtrar sem saber o UUID. */
export async function listarSecretariasMuse(client: SupabaseAdminLike): Promise<SecretariaMuse[]> {
  const { data, error } = await client
    .from("secretarias")
    .select("id,nome,sigla")
    .order("nome", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { id: string; nome: string; sigla: string | null }[]).map((s) => ({
    id: s.id,
    nome: s.nome,
    sigla: s.sigla ?? null,
  }));
}

export type ResumoMuse = {
  total: number;
  porStatus: { aberto: number; em_andamento: number; concluido: number };
  porSecretaria: {
    secretariaId: string | null;
    secretaria: string;
    total: number;
    abertos: number;
    vencidos: number;
  }[];
  /** Faixas de vencimento (não concluídos): hoje, em 1–3 dias, em 4–7 dias. */
  vencendo: { hoje: number; emAte3Dias: number; emAte7Dias: number };
  /** Vencidos pela regra de prazo do próprio tipo (mesma conta do dashboard/chat). */
  atrasadas: number;
  /** Vencidas só entre ouvidorias — o mesmo número do GET /atrasadas (totalAtrasadas). */
  atrasadasOuvidoria: number;
  /** Não concluídos sem resolução registrada (mesma conta de resumoOperacional). */
  aguardandoResposta: number;
};

/**
 * Contagens operacionais. `atrasadas` usa a situação do SLA por tipo
 * (dashboard/chat); `atrasadasOuvidoria` usa a regra do Atrasados
 * (só ouvidoria, 30 dias) para bater com o GET /atrasadas.
 */
export function calcularResumoMuse(
  rows: readonly ProtocoloMuseRow[],
  refDate: Date = new Date(),
): ResumoMuse {
  const porStatus = { aberto: 0, em_andamento: 0, concluido: 0 };
  const porSec = new Map<
    string | null,
    { secretariaId: string | null; secretaria: string; total: number; abertos: number; vencidos: number }
  >();
  let hoje = 0;
  let emAte3Dias = 0;
  let emAte7Dias = 0;
  let atrasadas = 0;
  let aguardando = 0;
  for (const row of rows) {
    const p = mapearProtocoloMuse(row, refDate);
    if (!p) continue;
    if (p.status === "aberto") porStatus.aberto++;
    else if (p.status === "em_andamento") porStatus.em_andamento++;
    else if (p.status === "concluido") porStatus.concluido++;
    const sec = porSec.get(row.secretaria_id) ?? {
      secretariaId: row.secretaria_id,
      secretaria: p.secretaria,
      total: 0,
      abertos: 0,
      vencidos: 0,
    };
    sec.total++;
    if (p.status !== "concluido") {
      sec.abertos++;
      if (p.situacao === "vencido") {
        sec.vencidos++;
        atrasadas++;
      } else if (p.diasRestantes === 0) hoje++;
      else if (p.diasRestantes <= 3) emAte3Dias++;
      else if (p.diasRestantes <= 7) emAte7Dias++;
      if (!row.triagem_pendente && !row.resolucao) aguardando++;
    }
    porSec.set(row.secretaria_id, sec);
  }
  const atrasadasOuvidoria = classificarAtrasadas(
    rows as unknown as readonly ProtocoloAtrasadoRow[],
    refDate,
  ).totalAtrasadas;
  return {
    total: porStatus.aberto + porStatus.em_andamento + porStatus.concluido,
    porStatus,
    porSecretaria: [...porSec.values()].sort((a, b) => b.total - a.total),
    vencendo: { hoje, emAte3Dias, emAte7Dias },
    atrasadas,
    atrasadasOuvidoria,
    aguardandoResposta: aguardando,
  };
}

/** Resumo operacional direto do banco. */
export async function resumoProtocolosMuse(
  client: SupabaseAdminLike,
  refDate: Date = new Date(),
): Promise<ResumoMuse> {
  const rows = await fetchAllPaginated<ProtocoloMuseRow>((from, to) =>
    client
      .from("protocolos")
      .select(SELECT_PROTOCOLOS)
      .order("data_abertura", { ascending: false })
      .range(from, to),
  );
  return calcularResumoMuse(rows, refDate);
}

export type EdicaoMuseAplicada = {
  protocolo: ProtocoloMuse;
  enderecoAnterior: string | null;
  camposAlterados: string[];
};

/**
 * Aplica o PATCH de campos seguros via RPC aplicar_edicao_muse
 * (migrações 0036/0038). A RPC só aceita os campos da allow-list, confere
 * secretaria/local, e grava com app.muse=on para o trigger
 * log_protocolo_changes registrar autor "Muse" em protocolo_historico
 * — a mesma auditoria da edição do painel e da conferência do 1Doc.
 * Nunca altera status, conclusão ou prazo.
 */
export async function aplicarEdicaoMuse(
  client: SupabaseAdminLike,
  id: string,
  body: MuseEditarProtocoloBody,
  refDate: Date = new Date(),
): Promise<EdicaoMuseAplicada> {
  const atual = await buscarProtocoloMuse(client, id, refDate);
  if (!atual) throw new Error("Protocolo não encontrado");

  const patch: Record<string, unknown> = {};
  if (body.endereco !== undefined) patch.endereco = body.endereco;
  if (body.latitude !== undefined) patch.latitude = body.latitude;
  if (body.longitude !== undefined) patch.longitude = body.longitude;
  if (body.assunto !== undefined) patch.assunto = body.assunto;
  if (body.descricao !== undefined) patch.descricao = body.descricao === "" ? null : body.descricao;
  if (body.solicitante !== undefined)
    patch.solicitante = body.solicitante === "" ? null : body.solicitante;
  if (body.categoria !== undefined) {
    // O banco persiste pedido_informacao no lugar de esic, como o painel.
    patch.categoria = categoriaPersistida(atual.tipo as TipoProtocolo, body.categoria);
  }
  if (body.secretaria_id !== undefined) patch.secretaria_id = body.secretaria_id;
  if (body.local_id !== undefined) patch.local_id = body.local_id;
  if (body.url !== undefined) patch.url = body.url;

  const { error } = await client.rpc("aplicar_edicao_muse", { p_id: id, p_patch: patch });
  if (error) throw error;

  const atualizado = await buscarProtocoloMuse(client, id, refDate);
  if (!atualizado) throw new Error("Protocolo não encontrado");
  return {
    protocolo: atualizado,
    enderecoAnterior: atual.endereco,
    camposAlterados: Object.keys(patch),
  };
}
