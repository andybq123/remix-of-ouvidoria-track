import { z } from "zod";
import type { OnedocResultado } from "@/lib/onedoc-history";

/**
 * Helpers compartilhados pelas rotas públicas do Muse
 * (src/routes/api/public/muse/*) e pelos testes.
 *
 * Nada aqui toca no banco nem conclui protocolo: a única escrita da
 * integração continua sendo o enfileiramento em onedoc_jobs, processado
 * pelo agente da VPS com a regra de baixa de parse.mjs.
 */

export function museCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

/** Token dedicado da integração. Nunca reuse INGEST_TOKEN. */
export function museTokenEsperado(): string {
  return process.env.MUSE_API_TOKEN ?? "";
}

/**
 * Valida o Bearer token da rota. Devolve null quando está ok, ou a
 * Response de erro (500 sem token configurado, 401 sem/errado).
 * Segue o padrão de check-protocolos.ts (comparação simples de string).
 */
export function validarTokenMuse(request: Request): Response | null {
  const expected = museTokenEsperado();
  if (!expected) {
    return Response.json(
      { error: "MUSE_API_TOKEN não configurado" },
      { status: 500, headers: museCorsHeaders() },
    );
  }
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: museCorsHeaders() });
  }
  return null;
}

export const museConferirBodySchema = z.object({
  secretariaId: z.string().uuid().optional(),
  protocoloIds: z.array(z.string().uuid()).min(1).max(5000).optional(),
  simulacao: z.boolean().optional(),
});

export type MuseConferirBody = z.infer<typeof museConferirBodySchema>;

export type ResumoJobMuse = {
  encerradas: number;
  continuamAtrasadas: number;
  erros: number;
};

/**
 * Resumo de um job pedido pelo Muse, calculado a partir de `resultados`.
 * - encerradas: resultados com concluido=true
 * - continuamAtrasadas: processados sem erro e sem conclusão
 * - erros: campo `erros` do job (quando ausente, conta os resultados com erro)
 */
export function resumoJobMuse(
  resultados: readonly OnedocResultado[] | null | undefined,
  errosDoJob?: number | null,
): ResumoJobMuse {
  const lista = Array.isArray(resultados) ? resultados : [];
  const encerradas = lista.filter((r) => r.concluido === true).length;
  const errosResultados = lista.filter((r) => !!r.erro).length;
  const continuamAtrasadas = lista.filter((r) => !r.erro && r.concluido !== true).length;
  return {
    encerradas,
    continuamAtrasadas,
    erros: typeof errosDoJob === "number" ? errosDoJob : errosResultados,
  };
}

const CAMPOS_RESULTADO_JOB = [
  "id",
  "numero",
  "assunto",
  "secretaria_id",
  "secretaria_nome",
  "verificado_em",
  "erro",
  "concluido",
  "data_conclusao",
  "situacao",
  "endereco_atualizado",
  "assunto_atualizado",
  "categoria_atualizada",
  "localizacao_atualizada",
] as const;

/**
 * Devolve só os campos que o endpoint de job pode expor. Nunca inclui
 * solicitante, relato ou endereço completo do protocolo.
 */
export function sanitizarResultadoJob(resultado: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_RESULTADO_JOB) {
    if (campo in resultado) out[campo] = resultado[campo];
  }
  return out;
}
