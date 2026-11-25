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

/** Origem do token que está valendo para a integração. */
export type OrigemTokenMuse = "sistema" | "env" | "nenhuma";

export type TokenMuseResolvido = {
  /** O token (só existe no servidor — nunca vai para o navegador). */
  token: string;
  origem: OrigemTokenMuse;
};

/** Mesma máscara usada em getAiConfig para Groq/Gemini: só os últimos 4. */
export function mascararTokenMuse(token: string | null | undefined): string | null {
  const t = (token ?? "").trim();
  return t ? `••••${t.slice(-4)}` : null;
}

// Cliente Supabase (admin) passado pelos chamadores; o builder encadeado
// (select/eq/maybeSingle) não tem tipo estrutural simples neste repo.
type SupabaseAdminLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabela: string) => any;
};

/**
 * Resolve o token da integração Muse.
 *
 * 1. Banco primeiro: `ai_config.muse_api_token`, informado em
 *    Configurações > IA (migração 0035/036).
 * 2. Fallback: `MUSE_API_TOKEN` da variável de ambiente, para quem já
 *    configurou por env antes da tela existir.
 * 3. Nenhum dos dois: token vazio, origem "nenhuma".
 *
 * Sem a coluna no banco (VPS ainda não atualizada), a leitura falha e
 * cai para o env em vez de quebrar — igual a musePausado().
 */
export async function resolverTokenMuse(
  client?: SupabaseAdminLike | null,
): Promise<TokenMuseResolvido> {
  const env = (process.env.MUSE_API_TOKEN ?? "").trim();
  if (client) {
    try {
      const { data, error } = await client
        .from("ai_config")
        .select("muse_api_token")
        .eq("id", true)
        .maybeSingle();
      if (!error) {
        const db = (
          (data as { muse_api_token?: string | null } | null)?.muse_api_token ?? ""
        ).trim();
        if (db) return { token: db, origem: "sistema" };
      }
    } catch {
      /* sem coluna / sem banco: cai para o env */
    }
  }
  if (env) return { token: env, origem: "env" };
  return { token: "", origem: "nenhuma" };
}

/** Token dedicado da integração. Nunca reuse INGEST_TOKEN. */
export function museTokenEsperado(): string {
  return process.env.MUSE_API_TOKEN ?? "";
}

/**
 * Valida o Bearer token da rota. Devolve null quando está ok, ou a
 * Response de erro (500 sem token configurado em lugar nenhum, 401
 * sem/errado). Segue o padrão de check-protocolos.ts (comparação
 * simples de string). Passe o client admin para resolver também o
 * token guardado no sistema; sem ele, só o env é considerado.
 */
export async function validarTokenMuse(
  request: Request,
  client?: SupabaseAdminLike | null,
): Promise<Response | null> {
  const { token: expected } = await resolverTokenMuse(client);
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

/**
 * Corpo do POST /protocolo/{id}/triar (.strict(): qualquer outro campo —
 * status, data_conclusao, tipo, numero, onedoc_* — é rejeitado com 400).
 *
 * `acao` é opcional e o padrão é "concluir", então o uso principal é
 * POST /triar { secretaria_id, local_id, descricao } — igual ao
 * "Concluir triagem" do painel. "iniciar" reserva o protocolo para o
 * Muse (a UI mostra "Triando com o Ouvidorizinho") e "cancelar" libera
 * a reserva. Em "concluir", secretaria_id e descricao (mín. 5
 * caracteres, como no painel) são obrigatórios; endereco/latitude/
 * longitude seguem os mesmos limites do PATCH (endereco 1–300).
 */
export const museTriarProtocoloBodySchema = z
  .object({
    acao: z.enum(["iniciar", "concluir", "cancelar"]).optional(),
    secretaria_id: z.string().uuid().optional(),
    local_id: z.string().uuid().nullable().optional(),
    descricao: z.string().trim().min(5).max(20000).optional(),
    endereco: z.string().trim().min(1).max(300).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if ((b.acao ?? "concluir") !== "concluir") return;
    if (!b.secretaria_id) {
      ctx.addIssue({
        code: "custom",
        path: ["secretaria_id"],
        message: "Defina a secretaria antes de concluir a triagem.",
      });
    }
    if (!b.descricao || b.descricao.trim().length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["descricao"],
        message: "Informe uma descrição (breve relato) antes de concluir a triagem.",
      });
    }
  });

export type MuseTriarProtocoloBody = z.infer<typeof museTriarProtocoloBodySchema>;

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
