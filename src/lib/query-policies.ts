import { QueryClient } from "@tanstack/react-query";

/** Tempos de cache (ms) por tipo de dado — ver políticas do TanStack Query. */
export const STALE = {
  referencia: 5 * 60_000, // secretarias, locais, assuntos, configs não sensíveis
  lista: 30_000, // listagens de protocolos
  detalhe: 15_000, // detalhe e histórico
  dashboard: 45_000, // indicadores
  busca: 15_000, // buscas/filtros
  alertas: 60 * 60_000, // sino de avisos: reconfere a cada 1 hora
} as const;

/** Chaves centralizadas para código novo; inclua todos os parâmetros que mudam o resultado. */
export const queryKeys = {
  protocolos: {
    all: ["protocolos"] as const,
    lista: (filtros?: unknown) => ["protocolos", "lista", filtros ?? {}] as const,
    detalhe: (id: string | undefined) => ["protocolo", id] as const,
    historico: (id: string | undefined) => ["historico", id] as const,
  },
  secretarias: { lista: () => ["secretarias"] as const },
  locais: { lista: () => ["locais"] as const },
  assuntos: { lista: () => ["assuntos"] as const },
  dashboard: (filtros?: unknown) => ["protocolos-dashboard", filtros ?? {}] as const,
};

/** Prefixo da chave → staleTime. Aplicado via setQueryDefaults (casamento por prefixo). */
const POR_PREFIXO: Array<[string, number]> = [
  ["secretarias", STALE.referencia],
  ["secretaria", STALE.referencia],
  ["secretaria-saude", STALE.referencia],
  ["secretaria-saude-id", STALE.referencia],
  ["secretarias-mapa-setores", STALE.referencia],
  ["secretaria-responsaveis", STALE.referencia],
  ["coletor-secretarias", STALE.referencia],
  ["pub-secretarias", STALE.referencia],
  ["locais", STALE.referencia],
  ["locais-all", STALE.referencia],
  ["locais-sec", STALE.referencia],
  ["locais-saude", STALE.referencia],
  ["locais-com-coordenadas", STALE.referencia],
  ["locais-setores-mapa", STALE.referencia],
  ["pub-locais", STALE.referencia],
  ["assuntos", STALE.referencia],
  ["protocolos", STALE.lista],
  ["protocolos-triagem", STALE.lista],
  ["protocolos-sec", STALE.lista],
  ["coletor-protocolos", STALE.lista],
  ["atrasadas-localizacao", STALE.lista],
  ["protocolo", STALE.detalhe],
  ["historico", STALE.detalhe],
  ["protocolos-dashboard", STALE.dashboard],
  ["triagem-stats", STALE.dashboard],
  ["triagem-pendentes-count", STALE.alertas],
  ["protocolos-alertas", STALE.alertas],
  ["protocolos-open-count", STALE.dashboard],
  ["protocolos-mapa-setores", STALE.dashboard],
  ["protocolos-por-local-setores", STALE.dashboard],
  ["debug-lista", STALE.busca],
];

/** Não repetir em erros de autenticação, permissão ou validação. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  const e = error as any;
  const status = Number(e?.status ?? e?.statusCode ?? e?.response?.status);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  const code = String(e?.code ?? "");
  if (code === "42501" || code === "PGRST301" || code.startsWith("22") || code.startsWith("23")) return false;
  const msg = String(e?.message ?? "").toLowerCase();
  if (/unauthori|forbidden|permiss|não autorizado|nao autorizado|jwt|admin/.test(msg)) return false;
  return true;
}

export function createAppQueryClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true, // só refaz quando stale
        retry: shouldRetry,
        structuralSharing: true,
      },
      mutations: { retry: false },
    },
  });
  for (const [prefix, staleTime] of POR_PREFIXO) {
    qc.setQueryDefaults([prefix], { staleTime });
  }
  return qc;
}
