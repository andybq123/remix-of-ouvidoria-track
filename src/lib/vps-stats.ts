// Estatísticas da VPS: tipos e helpers puros (parse + formatação).
// A coleta é feita no host por local-docker/deploy/coletar-vps-stats.sh
// (1x/min via cron) e lida pelo servidor em vps-stats.server.ts.

export type VpsContainerStats = {
  nome: string;
  estado: string;
  emExecucao: boolean;
};

export type VpsStatsColeta = {
  versao: number;
  coletadoEm: string;
  hostname: string | null;
  uptimeSegundos: number;
  load: [number, number, number];
  cpu: { nucleos: number; usoPercentual: number };
  memoria: {
    totalBytes: number;
    usadaBytes: number;
    livreBytes: number;
    disponivelBytes: number;
  };
  disco: {
    totalBytes: number;
    usadoBytes: number;
    livreBytes: number;
    usoPercentual: number;
    pontoMontagem: string;
  };
  containers: VpsContainerStats[];
  node: string | null;
  appCommit: string | null;
  appVersao: string | null;
};

export type VpsStatsResposta = {
  disponivel: boolean;
  coletadoEm: string | null;
  idadeSegundos: number | null;
  desatualizado: boolean;
  coleta: VpsStatsColeta | null;
};

/** Idade a partir da qual a coleta é considerada desatualizada. */
export const VPS_STATS_DESATUALIZADO_SEGUNDOS = 180;

function eNumeroFinito(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function eNumeroNaoNegativo(v: unknown): v is number {
  return eNumeroFinito(v) && v >= 0;
}

function eStringOuNulo(v: unknown): v is string | null {
  return v === null || v === undefined || typeof v === "string";
}

/**
 * Valida o JSON escrito pelo coletor. Devolve null quando o conteúdo
 * não é um objeto válido (arquivo corrompido, versão desconhecida,
 * campo obrigatório ausente ou fora da faixa) — nesses casos a página
 * mostra "coletando…" em vez de quebrar.
 */
export function parseEstatisticasVps(valor: unknown): VpsStatsColeta | null {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (v.versao !== 1) return null;
  if (typeof v.coletadoEm !== "string" || Number.isNaN(Date.parse(v.coletadoEm))) return null;
  if (!eNumeroNaoNegativo(v.uptimeSegundos)) return null;
  if (
    !Array.isArray(v.load) ||
    v.load.length !== 3 ||
    !v.load.every((n) => eNumeroNaoNegativo(n))
  ) {
    return null;
  }
  const cpu = v.cpu as Record<string, unknown> | null;
  if (
    !cpu ||
    typeof cpu !== "object" ||
    !eNumeroNaoNegativo(cpu.nucleos) ||
    !eNumeroFinito(cpu.usoPercentual) ||
    (cpu.usoPercentual as number) < 0 ||
    (cpu.usoPercentual as number) > 100
  ) {
    return null;
  }
  const memoria = v.memoria as Record<string, unknown> | null;
  if (
    !memoria ||
    typeof memoria !== "object" ||
    !eNumeroNaoNegativo(memoria.totalBytes) ||
    !eNumeroNaoNegativo(memoria.usadaBytes) ||
    !eNumeroNaoNegativo(memoria.livreBytes) ||
    !eNumeroNaoNegativo(memoria.disponivelBytes)
  ) {
    return null;
  }
  const disco = v.disco as Record<string, unknown> | null;
  if (
    !disco ||
    typeof disco !== "object" ||
    !eNumeroNaoNegativo(disco.totalBytes) ||
    !eNumeroNaoNegativo(disco.usadoBytes) ||
    !eNumeroNaoNegativo(disco.livreBytes) ||
    !eNumeroFinito(disco.usoPercentual) ||
    (disco.usoPercentual as number) < 0 ||
    (disco.usoPercentual as number) > 100 ||
    typeof disco.pontoMontagem !== "string"
  ) {
    return null;
  }
  if (!Array.isArray(v.containers)) return null;
  const containers: VpsContainerStats[] = [];
  for (const c of v.containers) {
    if (
      c === null ||
      typeof c !== "object" ||
      typeof (c as Record<string, unknown>).nome !== "string" ||
      ((c as Record<string, unknown>).nome as string).length === 0 ||
      typeof (c as Record<string, unknown>).estado !== "string" ||
      typeof (c as Record<string, unknown>).emExecucao !== "boolean"
    ) {
      return null;
    }
    containers.push(c as VpsContainerStats);
  }
  if (
    !eStringOuNulo(v.hostname) ||
    !eStringOuNulo(v.node) ||
    !eStringOuNulo(v.appCommit) ||
    !eStringOuNulo(v.appVersao)
  ) {
    return null;
  }
  return {
    versao: 1,
    coletadoEm: v.coletadoEm as string,
    hostname: (v.hostname as string | null | undefined) ?? null,
    uptimeSegundos: v.uptimeSegundos as number,
    load: v.load as [number, number, number],
    cpu: cpu as VpsStatsColeta["cpu"],
    memoria: memoria as VpsStatsColeta["memoria"],
    disco: disco as VpsStatsColeta["disco"],
    containers,
    node: (v.node as string | null | undefined) ?? null,
    appCommit: (v.appCommit as string | null | undefined) ?? null,
    appVersao: (v.appVersao as string | null | undefined) ?? null,
  };
}

/** Segundos desde a coleta; null quando a data é inválida. */
export function idadeColetaSegundos(coletadoEm: string, agoraMs = Date.now()): number | null {
  const ms = Date.parse(coletadoEm);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((agoraMs - ms) / 1000));
}

/** Verdadeiro quando há idade conhecida e ela passou do limite. */
export function estaDesatualizado(idadeSegundos: number | null): boolean {
  return idadeSegundos !== null && idadeSegundos > VPS_STATS_DESATUALIZADO_SEGUNDOS;
}

const UNIDADES_BYTES = ["B", "KB", "MB", "GB", "TB"];

/** 1536 -> "1,5 KB"; 5 GiB -> "5 GB". */
export function formatarBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let valor = bytes;
  let unidade = 0;
  while (valor >= 1024 && unidade < UNIDADES_BYTES.length - 1) {
    valor /= 1024;
    unidade += 1;
  }
  const texto =
    unidade === 0
      ? String(Math.round(valor))
      : valor.toFixed(1).replace(".", ",").replace(/,0$/, "");
  return `${texto} ${UNIDADES_BYTES[unidade]}`;
}

/** 12.3 -> "12,3%". */
export function formatarPercentual(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  return `${valor.toFixed(1).replace(".", ",")}%`;
}

/** 90 -> "1 min"; 3661 -> "1 h 1 min"; 90061 -> "1 dia, 1 h". */
export function formatarUptime(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "—";
  const total = Math.floor(segundos);
  if (total < 60) return `${total} s`;
  const minutos = Math.floor(total / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const restoMin = minutos % 60;
    return restoMin === 0 ? `${horas} h` : `${horas} h ${restoMin} min`;
  }
  const dias = Math.floor(horas / 24);
  const restoHoras = horas % 24;
  const diasTexto = dias === 1 ? "1 dia" : `${dias} dias`;
  return restoHoras === 0 ? diasTexto : `${diasTexto}, ${restoHoras} h`;
}

/** 30 -> "há 30 s"; 300 -> "há 5 min"; 7200 -> "há 2 h". */
export function formatarIdade(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "—";
  if (segundos < 5) return "agora mesmo";
  return `há ${formatarUptime(segundos)}`;
}

/** Ordem de exibição: app, agente 1Doc e coletor de e-mail primeiro. */
const PRIORIDADE_CONTAINERS: [RegExp, number][] = [
  [/^local-docker-app-1$/, 0],
  [/^local-docker-agente-1doc-1$/, 1],
  [/^local-docker-coletor-email-1$/, 2],
  [/supabase_db/, 3],
];

export function ordenarContainers(containers: VpsContainerStats[]): VpsContainerStats[] {
  const prioridade = (nome: string): number => {
    for (const [re, peso] of PRIORIDADE_CONTAINERS) if (re.test(nome)) return peso;
    return 4;
  };
  return [...containers].sort((a, b) => {
    const pa = prioridade(a.nome);
    const pb = prioridade(b.nome);
    if (pa !== pb) return pa - pb;
    return a.nome.localeCompare(b.nome);
  });
}
