import { describe, expect, it } from "vitest";

import { museTriarProtocoloBodySchema } from "./muse-api.server";

import {
  cancelarTriagemMuse,
  concluirTriagemMuse,
  exigeEnderecoObras,
  iniciarTriagemMuse,
  type ProtocoloTriagemRow,
} from "./muse-triagem.server";

const SEC_SAUDE = "c247febe-5801-4a01-8835-21da7a132a27";
const SEC_OBRAS = "d358febe-5801-4a01-8835-21da7a132a28";
const LOCAL_UBS = "e469febe-5801-4a01-8835-21da7a132a29";
const LOCAL_OUTRO = "f57afebe-5801-4a01-8835-21da7a132a30";

function linha(over: Partial<ProtocoloTriagemRow>): ProtocoloTriagemRow {
  return {
    id: "id-1",
    numero: "4.092/2026",
    tipo: "ouvidoria",
    status: "em_andamento",
    triagem_pendente: true,
    triagem_origem: null,
    triagem_lock_em: null,
    triagem_lock_por: null,
    triagem_concluida_em: null,
    secretaria_id: null,
    local_id: null,
    ...over,
  };
}

describe("corpo do POST /triar", () => {
  it("concluir (padrão) exige secretaria_id e descricao com no mínimo 5 caracteres", () => {
    expect(
      museTriarProtocoloBodySchema.safeParse({
        secretaria_id: SEC_SAUDE,
        descricao: "Elogio ao médico Geraldo.",
      }).success,
    ).toBe(true);

    expect(
      museTriarProtocoloBodySchema.safeParse({ secretaria_id: SEC_SAUDE }).success,
    ).toBe(false);
    expect(museTriarProtocoloBodySchema.safeParse({ descricao: "relato" }).success).toBe(false);
    expect(
      museTriarProtocoloBodySchema.safeParse({ secretaria_id: SEC_SAUDE, descricao: "oi" })
        .success,
    ).toBe(false);
  });

  it("iniciar e cancelar não exigem secretaria nem descricao", () => {
    expect(museTriarProtocoloBodySchema.safeParse({ acao: "iniciar" }).success).toBe(true);
    expect(museTriarProtocoloBodySchema.safeParse({ acao: "cancelar" }).success).toBe(true);
    expect(museTriarProtocoloBodySchema.safeParse({ acao: "iniciar", descricao: "x" }).success).toBe(
      false,
    );
  });

  it("rejeita qualquer campo fora da allow-list e coordenadas inválidas", () => {
    for (const proibido of [
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", status: "concluido" },
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", tipo: "esic" },
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", numero: "1/2026" },
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", onedoc_situacao: "baixada" },
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", campo_novo: "x" },
      { acao: "iniciar", secretaria_id: "nao-uuid" },
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", latitude: 91 },
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", longitude: -181 },
      { secretaria_id: SEC_SAUDE, descricao: "relato ok", endereco: "x".repeat(301) },
    ]) {
      expect(museTriarProtocoloBodySchema.safeParse(proibido).success).toBe(false);
    }
  });
});

describe("regra de Obras (endereço + ponto no mapa)", () => {
  it("SOSU, Obras e Serviços Urbanos exigem endereço; Saúde não", () => {
    expect(exigeEnderecoObras({ nome: "SOSU - Obras", sigla: "SOSU" })).toBe(true);
    expect(exigeEnderecoObras({ nome: "Secretaria de Serviços Urbanos", sigla: null })).toBe(true);
    expect(exigeEnderecoObras({ nome: "Obras", sigla: null })).toBe(true);
    expect(exigeEnderecoObras({ nome: "Saúde", sigla: null })).toBe(false);
    expect(exigeEnderecoObras({ nome: "SIE - Infraestrutura Estratégica", sigla: "SIE" })).toBe(
      false,
    );
    expect(exigeEnderecoObras({ nome: null, sigla: null })).toBe(false);
  });
});

describe("triagem pelo Muse (reserva, conclusão e cancelamento)", () => {
  /** Fake mínimo: maybeSingle por tabela; rpc grava os args recebidos. */
  function clienteTriagem(opts: {
    protocolo: ProtocoloTriagemRow | null;
    protocoloFinal?: ProtocoloTriagemRow | null;
    secretaria?: { id: string; nome: string | null; sigla: string | null } | null;
    local?: { id: string; nome: string | null; secretaria_id: string | null } | null;
    rpcData?: unknown;
    rpcErro?: { message: string } | null;
  }) {
    let chamadasProtocolo = 0;
    let rpcArgs: { fn: string; args: Record<string, unknown> } | null = null;

    const client = {
      rpcArgs: () => rpcArgs,

      from: (tabela: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (tabela === "protocolos") {
                chamadasProtocolo++;
                const data =
                  chamadasProtocolo === 1 ? opts.protocolo : (opts.protocoloFinal ?? opts.protocolo);
                return { data, error: null };
              }
              if (tabela === "secretarias") return { data: opts.secretaria ?? null, error: null };
              if (tabela === "locais") return { data: opts.local ?? null, error: null };
              return { data: null, error: null };
            },
          }),
        }),
      }),

      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcArgs = { fn, args };
        return { data: opts.rpcData ?? null, error: opts.rpcErro ?? null };
      },
    };

    return client;
  }

  it("reserva e devolve triandoPor Muse com a trava", async () => {
    const client = clienteTriagem({
      protocolo: linha({}),
      rpcData: { ok: true, lock_em: "2026-11-25T15:00:00.000Z" },
    });

    const r = await iniciarTriagemMuse(client as never, "id-1");

    expect(r).toEqual({
      id: "id-1",
      numero: "4.092/2026",
      triandoPor: "Muse",
      lockEm: "2026-11-25T15:00:00.000Z",
    });
    expect(client.rpcArgs()?.fn).toBe("reservar_triagem_muse");
    expect(client.rpcArgs()?.args).toEqual({ p_id: "id-1" });
  });

  it("rejeita e-SIC, protocolo inexistente, já triado e trava de outro usuário", async () => {
    await expect(
      iniciarTriagemMuse(clienteTriagem({ protocolo: linha({ tipo: "esic" }) }) as never, "id-1"),
    ).rejects.toThrow("e-SIC não é triado pelo Muse");

    await expect(
      iniciarTriagemMuse(clienteTriagem({ protocolo: null }) as never, "id-1"),
    ).rejects.toThrow("Protocolo não encontrado");

    await expect(
      iniciarTriagemMuse(
        clienteTriagem({ protocolo: linha({ triagem_pendente: false }) }) as never,
        "id-1",
      ),
    ).rejects.toThrow("Protocolo já triado");

    await expect(
      iniciarTriagemMuse(
        clienteTriagem({
          protocolo: linha({}),
          rpcData: { ok: false, motivo: "reservada", por: "Anderson", em: "2026-11-25T14:55:00Z" },
        }) as never,
        "id-1",
      ),
    ).rejects.toThrow("Protocolo em triagem por Anderson");

    await expect(
      iniciarTriagemMuse(
        clienteTriagem({
          protocolo: linha({}),
          rpcData: { ok: false, motivo: "concluida", por: "Anderson", em: "2026-11-25T14:00:00Z" },
        }) as never,
        "id-1",
      ),
    ).rejects.toThrow("Protocolo já triado por Anderson");
  });

  it("conclui o caso 4.092/2026: Saúde + UBS Santa Terezinha, triado por Muse", async () => {
    const client = clienteTriagem({
      protocolo: linha({}),
      protocoloFinal: linha({
        triagem_pendente: false,
        triagem_origem: "muse",
        triagem_concluida_em: "2026-11-25T15:05:00.000Z",
        secretaria_id: SEC_SAUDE,
        local_id: LOCAL_UBS,
      }),
      secretaria: { id: SEC_SAUDE, nome: "Saúde", sigla: null },
      local: { id: LOCAL_UBS, nome: "UBS Santa Terezinha", secretaria_id: SEC_SAUDE },
      rpcData: null,
    });

    const r = await concluirTriagemMuse(client as never, "id-1", {
      secretaria_id: SEC_SAUDE,
      local_id: LOCAL_UBS,
      descricao: "Elogio ao médico Geraldo, atendimento na UBS Santa Terezinha.",
    });

    expect(r.secretaria).toBe("Saúde");
    expect(r.local).toBe("UBS Santa Terezinha");
    expect(r.triadoPor).toBe("Muse");
    expect(r.triadoEm).toBe("2026-11-25T15:05:00.000Z");
    expect(r.triagemPendente).toBe(false);
    expect(client.rpcArgs()?.fn).toBe("aplicar_triagem_muse");
    expect(client.rpcArgs()?.args).toEqual({
      p_id: "id-1",
      p_secretaria: SEC_SAUDE,
      p_local: LOCAL_UBS,
      p_descricao: "Elogio ao médico Geraldo, atendimento na UBS Santa Terezinha.",
      p_endereco: null,
      p_latitude: null,
      p_longitude: null,
    });
  });

  it("Obras sem endereço/ponto não chama a RPC; com eles, chama", async () => {
    const secretariaObras = { id: SEC_OBRAS, nome: "SOSU - Obras", sigla: "SOSU" };

    const semEndereco = clienteTriagem({
      protocolo: linha({}),
      secretaria: secretariaObras,
    });
    await expect(
      concluirTriagemMuse(semEndereco as never, "id-1", {
        secretaria_id: SEC_OBRAS,
        descricao: "Buraco na rua, risco de acidente.",
      }),
    ).rejects.toThrow("Endereço e ponto no mapa são obrigatórios para Obras");
    expect(semEndereco.rpcArgs()).toBeNull();

    const comEndereco = clienteTriagem({
      protocolo: linha({}),
      protocoloFinal: linha({ triagem_pendente: false, triagem_origem: "muse" }),
      secretaria: secretariaObras,
    });
    await concluirTriagemMuse(comEndereco as never, "id-1", {
      secretaria_id: SEC_OBRAS,
      descricao: "Buraco na rua, risco de acidente.",
      endereco: "R. Arnoldo Ristow, 422 - Santa Luzia, Brusque - SC, 88357-300",
      latitude: -27.1,
      longitude: -48.9,
    });
    expect(comEndereco.rpcArgs()?.fn).toBe("aplicar_triagem_muse");
    expect((comEndereco.rpcArgs()?.args as Record<string, unknown>).p_endereco).toBe(
      "R. Arnoldo Ristow, 422 - Santa Luzia, Brusque - SC, 88357-300",
    );
  });

  it("rejeita local de outra secretaria, secretaria inexistente e e-SIC", async () => {
    await expect(
      concluirTriagemMuse(
        clienteTriagem({
          protocolo: linha({}),
          secretaria: { id: SEC_SAUDE, nome: "Saúde", sigla: null },
          local: { id: LOCAL_OUTRO, nome: "Local Obras", secretaria_id: SEC_OBRAS },
        }) as never,
        "id-1",
        { secretaria_id: SEC_SAUDE, local_id: LOCAL_OUTRO, descricao: "Relato válido aqui." },
      ),
    ).rejects.toThrow("Local não pertence à secretaria");

    await expect(
      concluirTriagemMuse(
        clienteTriagem({ protocolo: linha({}), secretaria: null }) as never,
        "id-1",
        { secretaria_id: SEC_SAUDE, descricao: "Relato válido aqui." },
      ),
    ).rejects.toThrow("Secretaria não encontrada");

    await expect(
      concluirTriagemMuse(
        clienteTriagem({ protocolo: linha({ tipo: "esic" }) }) as never,
        "id-1",
        { secretaria_id: SEC_SAUDE, descricao: "Relato válido aqui." },
      ),
    ).rejects.toThrow("e-SIC não é triado pelo Muse");
  });

  it("cancelar libera a reserva do Muse; sem reserva, rejeita", async () => {
    const client = clienteTriagem({ protocolo: linha({}), rpcData: { ok: true } });
    const r = await cancelarTriagemMuse(client as never, "id-1");
    expect(r).toEqual({ id: "id-1", numero: "4.092/2026", cancelado: true });
    expect(client.rpcArgs()?.fn).toBe("liberar_triagem_muse");

    await expect(
      cancelarTriagemMuse(
        clienteTriagem({ protocolo: linha({}), rpcData: { ok: false, motivo: "sem_reserva_muse" } }) as never,
        "id-1",
      ),
    ).rejects.toThrow("Nenhuma triagem do Muse em andamento");
  });
});
