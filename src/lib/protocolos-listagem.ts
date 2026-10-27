import { supabase } from "@/integrations/supabase/client";
import { currentMonthValue } from "@/lib/month-filter";
import type { TipoProtocolo, StatusProtocolo } from "@/lib/prazo";

export const PROTOCOLOS_PAGE_SIZE = 50;

export function validarFiltrosProtocolos(search: Record<string, unknown>) {
  const text = (key: string, fallback = "") => typeof search[key] === "string" ? String(search[key]) : fallback;
  const option = (key: string, options: string[]) => options.includes(text(key)) ? text(key) : "todos";
  const mes = text("mes", currentMonthValue());
  const date = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(text(key)) ? text(key) : "";
  const pagina = Number(search.pagina);
  return {
    busca: text("busca"),
    status: option("status", ["todos", "aberto", "em_andamento", "concluido"]),
    tipo: option("tipo", ["todos", "ouvidoria", "lai", "esic"]),
    categoria: option("categoria", ["todos", "elogio", "reclamacao", "pedido_informacao", "esic", "denuncia", "solicitacao", "sugestao", "outros"]),
    secretaria: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(text("secretaria")) ? text("secretaria") : "todos",
    mes: /^(\d{4}-(0[1-9]|1[0-2])|all|antigos)$/.test(mes) ? mes : currentMonthValue(),
    dataIni: date("dataIni"), dataFim: date("dataFim"),
    pagina: Number.isSafeInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

export type FiltrosProtocolos = ReturnType<typeof validarFiltrosProtocolos>;
export type ProtocoloListagem = {
  id: string; numero: string; numero_esic: string | null;
  tipo: TipoProtocolo; categoria: string; status: StatusProtocolo;
  assunto: string; descricao: string | null; solicitante: string | null;
  data_abertura: string; prorrogado: boolean; origem: string | null; sigilo: string;
  secretarias: { nome: string; sigla: string | null } | null;
};
export type PaginaProtocolos = { items: ProtocoloListagem[]; total: number; pagina: number };

export function protocolosPaginaOptions(filtros: FiltrosProtocolos, somenteVigilancia: boolean) {
  return {
    queryKey: ["protocolos", "lista", { ...filtros, somenteVigilancia }] as const,
    queryFn: async (): Promise<PaginaProtocolos> => {
      const { data, error } = await supabase.rpc("listar_protocolos_pagina", {
        p_filtros: { ...filtros, somenteVigilancia },
      });
      if (error) throw error;
      return data as unknown as PaginaProtocolos;
    },
  };
}