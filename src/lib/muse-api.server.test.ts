import { afterEach, describe, expect, it } from "vitest";
import {
  mascararTokenMuse,
  museConferirBodySchema,
  resolverTokenMuse,
  resumoJobMuse,
  sanitizarResultadoJob,
  validarTokenMuse,
} from "./muse-api.server";

function req(t?: string) {
  return new Request("http://x/", t ? { headers: { Authorization: `Bearer ${t}` } } : undefined);
}

/** Cliente Supabase falso com o token Muse que estiver no "banco". */
function clienteFake(tokenBanco: string | null | "erro") {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            tokenBanco === "erro"
              ? { data: null, error: { message: "column muse_api_token does not exist" } }
              : { data: { muse_api_token: tokenBanco }, error: null },
        }),
      }),
    }),
  };
}

describe("API Muse — resolução do token", () => {
  afterEach(() => {
    delete process.env.MUSE_API_TOKEN;
  });

  it("mascara o token com os últimos 4 caracteres, como as chaves de IA", () => {
    expect(mascararTokenMuse("abcdefgh1234")).toBe("••••1234");
    expect(mascararTokenMuse("")).toBeNull();
    expect(mascararTokenMuse(null)).toBeNull();
  });

  it("token do banco (sistema) vence o do env", async () => {
    process.env.MUSE_API_TOKEN = "token-do-env-123456";
    const r = await resolverTokenMuse(clienteFake("token-do-banco-abcdef") as never);
    expect(r).toEqual({ token: "token-do-banco-abcdef", origem: "sistema" });
    // O token do env passa a ser rejeitado; só o do banco vale.
    expect(
      await validarTokenMuse(
        req("token-do-banco-abcdef"),
        clienteFake("token-do-banco-abcdef") as never,
      ),
    ).toBeNull();
    expect(
      (
        await validarTokenMuse(
          req("token-do-env-123456"),
          clienteFake("token-do-banco-abcdef") as never,
        )
      )?.status,
    ).toBe(401);
  });

  it("sem token no banco, usa o env como fallback", async () => {
    process.env.MUSE_API_TOKEN = "token-do-env-123456";
    const r = await resolverTokenMuse(clienteFake(null) as never);
    expect(r).toEqual({ token: "token-do-env-123456", origem: "env" });
    expect(
      await validarTokenMuse(req("token-do-env-123456"), clienteFake(null) as never),
    ).toBeNull();
  });

  it("sem a coluna no banco (VPS antiga), cai para o env em vez de quebrar", async () => {
    process.env.MUSE_API_TOKEN = "token-do-env-123456";
    const r = await resolverTokenMuse(clienteFake("erro") as never);
    expect(r).toEqual({ token: "token-do-env-123456", origem: "env" });
  });

  it("sem token em lugar nenhum: 500 e origem nenhuma", async () => {
    const r = await resolverTokenMuse(clienteFake(null) as never);
    expect(r).toEqual({ token: "", origem: "nenhuma" });
    expect((await validarTokenMuse(req("qualquer"), clienteFake(null) as never))?.status).toBe(500);
  });

  it("sem client (só env): 401 com token errado ou ausente", async () => {
    process.env.MUSE_API_TOKEN = "segredo-do-env-123456";
    expect(await validarTokenMuse(req("segredo-do-env-123456"))).toBeNull();
    expect((await validarTokenMuse(req()))?.status).toBe(401);
    expect((await validarTokenMuse(req("errado")))?.status).toBe(401);
    delete process.env.MUSE_API_TOKEN;
    expect((await validarTokenMuse(req("segredo")))?.status).toBe(500);
  });

  it("valida o corpo de conferir-atrasadas (Zod, máx. 5000 IDs)", () => {
    expect(museConferirBodySchema.safeParse({ simulacao: true }).success).toBe(true);
    expect(museConferirBodySchema.safeParse({ protocoloIds: [] }).success).toBe(false);
    expect(museConferirBodySchema.safeParse({ protocoloIds: ["nao-uuid"] }).success).toBe(false);
    expect(
      museConferirBodySchema.safeParse({
        protocoloIds: ["c247febe-5801-4a01-8835-21da7a132a27"],
        secretariaId: "c247febe-5801-4a01-8835-21da7a132a27",
      }).success,
    ).toBe(true);
  });

  it("resumo do job: encerradas, continuam atrasadas e erros", () => {
    expect(
      resumoJobMuse(
        [
          { id: "1", numero: "3.321/2026", concluido: true },
          { id: "2", numero: "3.677/2026", concluido: true },
          { id: "3", numero: "3.802/2026", concluido: false },
          { id: "4", numero: "3.999/2026", erro: "link quebrado" },
        ],
        1,
      ),
    ).toEqual({ encerradas: 2, continuamAtrasadas: 1, erros: 1 });
  });

  it("resposta do job nunca expõe solicitante, relato ou endereço", () => {
    expect(
      sanitizarResultadoJob({
        id: "1",
        numero: "3.321/2026",
        concluido: true,
        solicitante: "Fulana",
        relato: "texto sensível",
        endereco: "Rua X, 123",
      }),
    ).toEqual({ id: "1", numero: "3.321/2026", concluido: true });
  });
});
