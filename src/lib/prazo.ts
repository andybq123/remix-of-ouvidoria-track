import { addDays, differenceInCalendarDays, format } from "date-fns";

export type TipoProtocolo = "ouvidoria" | "lai" | "esic";
export type StatusProtocolo = "aberto" | "em_andamento" | "concluido";
export type CategoriaProtocolo =
  | "elogio"
  | "reclamacao"
  | "pedido_informacao"
  | "esic"
  | "denuncia"
  | "solicitacao"
  | "sugestao"
  | "outros";

export const CATEGORIAS: {
  value: CategoriaProtocolo;
  label: string;
  sigla: string;
  badgeClass: string;
}[] = [
  { value: "elogio",            label: "Elogio",               sigla: "E",   badgeClass: "bg-green-600 text-white border-transparent" },
  { value: "reclamacao",        label: "Reclamação",           sigla: "R",   badgeClass: "bg-red-600 text-white border-transparent" },
  { value: "pedido_informacao", label: "Pedido de informação", sigla: "LAI", badgeClass: "bg-purple-600 text-white border-transparent" },
  { value: "esic",              label: "Pedido e-SIC",          sigla: "e-SIC", badgeClass: "bg-teal-700 text-white border-transparent" },
  { value: "denuncia",          label: "Denúncia",             sigla: "D",   badgeClass: "bg-black text-white border-transparent" },
  { value: "solicitacao",       label: "Solicitação",          sigla: "S",   badgeClass: "bg-yellow-400 text-black border-transparent" },
  { value: "sugestao",          label: "Sugestão",             sigla: "SG",  badgeClass: "bg-blue-600 text-white border-transparent" },
  { value: "outros",            label: "Outros",               sigla: "—",   badgeClass: "bg-muted text-muted-foreground border-border" },
];

export const categoriaLabel = (c: CategoriaProtocolo) =>
  CATEGORIAS.find(x => x.value === c)?.label ?? c;

export const categoriaSigla = (c: CategoriaProtocolo) =>
  CATEGORIAS.find(x => x.value === c)?.sigla ?? "—";

export const categoriaBadgeClass = (c: CategoriaProtocolo) =>
  CATEGORIAS.find(x => x.value === c)?.badgeClass ?? "bg-muted text-muted-foreground border-border";

/** Categoria estatística: e-SIC é derivado do tipo e permanece um valor próprio nos relatórios. */
export function categoriaDoProtocolo(tipo?: string | null, categoria?: string | null): CategoriaProtocolo {
  if (tipo === "esic") return "esic";
  return CATEGORIAS.some((item) => item.value === categoria)
    ? (categoria as CategoriaProtocolo)
    : "outros";
}

/** Categoria compatível com o enum persistido do banco. */
export type CategoriaPersistidaProtocolo = Exclude<CategoriaProtocolo, "esic">;

export function categoriaPersistida(tipo: TipoProtocolo, categoria: CategoriaProtocolo): CategoriaPersistidaProtocolo {
  return tipo === "esic" || categoria === "esic" ? "pedido_informacao" : categoria;
}

export const PRAZOS = {
  ouvidoria: { inicial: 30, prorrogacao: 30, label: "Ouvidoria" },
  lai: { inicial: 20, prorrogacao: 10, label: "LAI" },
  esic: { inicial: 20, prorrogacao: 10, label: "e-SIC" },
} as const;

export function calcularPrazo(opts: {
  tipo: TipoProtocolo;
  data_abertura: string;
  prorrogado: boolean;
}): { prazoFinal: Date; diasTotais: number } {
  const { inicial, prorrogacao } = PRAZOS[opts.tipo];
  const diasTotais = inicial + (opts.prorrogado ? prorrogacao : 0);
  const prazoFinal = addDays(new Date(opts.data_abertura + "T00:00:00"), diasTotais);
  return { prazoFinal, diasTotais };
}

export function diasRestantes(prazoFinal: Date): number {
  return differenceInCalendarDays(prazoFinal, new Date());
}

export type Situacao = "vencido" | "critico" | "atencao" | "no_prazo" | "concluido";

export function situacaoProtocolo(p: {
  tipo: TipoProtocolo;
  data_abertura: string;
  prorrogado: boolean;
  status: StatusProtocolo;
}): { situacao: Situacao; dias: number; prazoFinal: Date } {
  const { prazoFinal } = calcularPrazo(p);
  const dias = diasRestantes(prazoFinal);
  if (p.status === "concluido") return { situacao: "concluido", dias, prazoFinal };
  if (dias < 0) return { situacao: "vencido", dias, prazoFinal };
  if (dias <= 3) return { situacao: "critico", dias, prazoFinal };
  if (dias <= 7) return { situacao: "atencao", dias, prazoFinal };
  return { situacao: "no_prazo", dias, prazoFinal };
}

/**
 * Verifica se o protocolo já estava atrasado numa data de referência:
 * - prazo final anterior a refDate
 * - E não estava concluído em refDate (sem data_conclusao ou concluído depois)
 */
export function estavaAtrasadoNaData(
  p: {
    tipo: TipoProtocolo;
    data_abertura: string;
    prorrogado: boolean;
    status: StatusProtocolo;
    data_conclusao?: string | null;
  },
  refDate: Date,
): { atrasado: boolean; diasAtraso: number; prazoFinal: Date } {
  const { prazoFinal } = calcularPrazo(p);
  const diasAtraso = differenceInCalendarDays(refDate, prazoFinal);
  const venceuAntes = prazoFinal < refDate;
  const dataConclusao = p.data_conclusao
    ? new Date(p.data_conclusao + (p.data_conclusao.length === 10 ? "T00:00:00" : ""))
    : null;
  const concluidoNaData =
    p.status === "concluido" &&
    !!dataConclusao &&
    dataConclusao <= refDate;
  return { atrasado: venceuAntes && !concluidoNaData, diasAtraso, prazoFinal };
}

/** Fim do mês (23:59:59) para YYYY-MM. Se for o mês corrente, retorna "agora". */
export function endOfMonthOrNow(ym: string): Date {
  const now = new Date();
  const [y, m] = ym.split("-").map(Number);
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (ym === currentYm) return now;
  const lastDay = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, lastDay, 23, 59, 59, 999);
}

export const situacaoLabel: Record<Situacao, string> = {
  vencido: "Vencido",
  critico: "Crítico",
  atencao: "Atenção",
  no_prazo: "No prazo",
  concluido: "Concluído",
};

export const situacaoClasses: Record<Situacao, string> = {
  vencido: "bg-destructive/10 text-destructive border-destructive/30",
  critico: "bg-destructive/10 text-destructive border-destructive/30",
  atencao: "bg-[var(--warning)]/15 text-[var(--warning-foreground)] border-[var(--warning)]/40",
  no_prazo: "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30",
  concluido: "bg-muted text-muted-foreground border-border",
};

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return format(date, "dd/MM/yyyy");
}

export function gerarNumeroProtocolo(tipo: TipoProtocolo): string {
  const now = new Date();
  const y = now.getFullYear();
  const seq = Math.floor(Math.random() * 9000) + 1000;
  // Formato: 1.234/AAAA (separador de milhar com ponto)
  const formatted = seq.toLocaleString("pt-BR");
  return `${formatted}/${y}`;
}
/* ------------------------------------------------------------------ *
 * MOTOR DE PRAZOS / SLA (camada única)
 * Toda a UI deve consumir `calcularSla` / <SlaBadge> em vez de
 * recalcular prazos localmente.
 * ------------------------------------------------------------------ */

export type ProtocoloSlaInput = {
  tipo: TipoProtocolo;
  data_abertura: string;
  prorrogado: boolean;
  status: StatusProtocolo;
  data_conclusao?: string | null;
  data_prorrogacao?: string | null;
  resolucao?: string | null;
  triagem_pendente?: boolean | null;
};

export type Sla = {
  situacao: Situacao;
  /** dias restantes (negativo = atrasado) */
  dias: number;
  prazoFinal: Date;
  diasTotais: number;
  podeProrrogar: boolean;
  diasProrrogacao: number;
  vencidoHoje: boolean;
  venceHoje: boolean;
  venceEm3Dias: boolean;
  aguardandoResposta: boolean;
  label: string;
  labelDias: string;
  classes: string;
};

/** Cálculo único e canônico do SLA de um protocolo. */
export function calcularSla(p: ProtocoloSlaInput): Sla {
  const { prazoFinal, diasTotais } = calcularPrazo(p);
  const dias = diasRestantes(prazoFinal);
  const { situacao } = situacaoProtocolo(p);
  const concluido = p.status === "concluido";
  const { prorrogacao } = PRAZOS[p.tipo];
  return {
    situacao,
    dias,
    prazoFinal,
    diasTotais,
    podeProrrogar: !p.prorrogado && !concluido,
    diasProrrogacao: prorrogacao,
    vencidoHoje: !concluido && dias === 0,
    venceHoje: !concluido && dias === 0,
    venceEm3Dias: !concluido && dias > 0 && dias <= 3,
    aguardandoResposta: !concluido && !p.triagem_pendente && !p.resolucao,
    label: situacaoLabel[situacao],
    labelDias:
      concluido
        ? "Concluído"
        : dias < 0
          ? `${Math.abs(dias)}d atrasado`
          : dias === 0
            ? "vence hoje"
            : `${dias}d`,
    classes: situacaoClasses[situacao],
  };
}

/** Agrupamentos operacionais usados pelo Dashboard e pelas notificações. */
export function resumoOperacional(protocolos: ProtocoloSlaInput[]) {
  let vencidos = 0, venceHoje = 0, vence3Dias = 0, aguardando = 0, concluidos = 0, emAndamento = 0;
  for (const p of protocolos) {
    const s = calcularSla(p);
    if (p.status === "concluido") { concluidos++; continue; }
    emAndamento++;
    if (s.dias < 0) vencidos++;
    else if (s.dias === 0) venceHoje++;
    else if (s.dias <= 3) vence3Dias++;
    if (s.aguardandoResposta) aguardando++;
  }
  return { vencidos, venceHoje, vence3Dias, aguardando, concluidos, emAndamento, total: protocolos.length };
}

/* ------------------------------------------------------------------ *
 * Resumo de prazo para popups de mapa (usa o mesmo cálculo do SLA).
 * ------------------------------------------------------------------ */

export type ResumoPrazoMapa = {
  prazoFinal: Date;
  /** Data-limite em dd/MM/yyyy */
  prazoTexto: string;
  /** Dias de atraso (>= 0). 0 quando não está atrasado. */
  diasAtraso: number;
  atrasado: boolean;
  concluido: boolean;
  /** Frase curta: "atrasada há 5 dias", "vence hoje", "faltam 12 dias", "Concluído". */
  diasTexto: string;
};

/**
 * Calcula o prazo de um protocolo para exibição em mapa.
 * Retorna null quando faltam dados (sem data de abertura ou tipo desconhecido).
 */
export function resumoPrazoMapa(p: {
  tipo?: string | null;
  data_abertura?: string | null;
  prorrogado?: boolean | null;
  status?: string | null;
  data_conclusao?: string | null;
}): ResumoPrazoMapa | null {
  const tipo = p.tipo as TipoProtocolo | null | undefined;
  if (!p.data_abertura || !tipo || !PRAZOS[tipo]) return null;
  const status = (p.status ?? "aberto") as StatusProtocolo;
  const { prazoFinal } = calcularPrazo({
    tipo,
    data_abertura: p.data_abertura,
    prorrogado: !!p.prorrogado,
  });
  const dias = diasRestantes(prazoFinal);
  const concluido = status === "concluido";
  const atrasado = !concluido && dias < 0;
  const diasAtraso = atrasado ? Math.abs(dias) : 0;
  const diasTexto = concluido
    ? "Concluído"
    : atrasado
      ? `atrasada há ${diasAtraso} ${diasAtraso === 1 ? "dia" : "dias"}`
      : dias === 0
        ? "vence hoje"
        : `faltam ${dias} ${dias === 1 ? "dia" : "dias"}`;
  return { prazoFinal, prazoTexto: formatDate(prazoFinal), diasAtraso, atrasado, concluido, diasTexto };
}
