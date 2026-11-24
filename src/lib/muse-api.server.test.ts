import { afterEach, describe, expect, it } from "vitest";
import {
  museConferirBodySchema,
  resumoJobMuse,
  sanitizarResultadoJob,
  validarTokenMuse,
} from "./muse-api.server";

describe("API Muse", () => {
  afterEach(() => {
    delete process.env.MUSE_API_TOKEN;
  });

  it("valida o Bearer token: ok, 401 com token errado e 500 sem token configurado", () => {
    process.env.MUSE_API_TOKEN = "segredo";
    const req = (t?: string) =>
      new Request("http://x/", t ? { headers: { Authorization: `Bearer ${t}` } } : undefined);
    expect(validarTokenMuse(req("segredo"))).toBeNull();
    expect(validarTokenMuse(req())?.status).toBe(401);
    expect(validarTokenMuse(req("errado"))?.status).toBe(401);
    delete process.env.MUSE_API_TOKEN;
    expect(validarTokenMuse(req("segredo"))?.status).toBe(500);
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
