import { describe, expect, it } from "vitest";
import {
  aplicarEdicaoMuse,
  buscarProtocoloMuse,
  calcularResumoMuse,
  classificarProtocolos,
  listarLocaisMuse,
  listarProtocolosMuse,
  listarSecretariasMuse,
  mapearProtocoloMuse,
  type ProtocoloMuseRow,
} from "./muse-protocolos.server";
import { museEditarProtocoloBodySchema } from "./muse-api.server";

const REF = new Date("2026-11-24T12:00:00-03:00");

function row(over: Partial<ProtocoloMuseRow>): ProtocoloMuseRow {
  return {
    id: "id-1",
    numero: "3.768/2026",
    tipo: "ouvidoria",
    categoria: "reclamacao",
    assunto: "Buraco na rua",
    descricao: "Local: Rua ZT-017, em frente ao posto de saúde",
    status: "aberto",
    endereco: "Rua Antiga, 10",
    latitude: null,
    longitude: null,
    secretaria_id: "sec-obras",
    local_id: null,
    data_abertura: "2026-09-23",
    data_conclusao: null,
    prorrogado: false,
    resolucao: null,
    triagem_pendente: false,
    url: "https://brusque.1doc.com.br/?pg=doc/ver&hash=abc",
    onedoc_situacao: null,
    onedoc_baixado_em: null,
    onedoc_arquivado_em: null,
    onedoc_verificado_em: null,
    secretarias: { nome: "SOSU - Obras", sigla: "SOSU" },
    ...over,
  };
}

describe("mapeamento de protocolo do Muse", () => {
  it("ouvidoria vencida há 32 dias (caso 3.321/2026)", () => {
    const p = mapearProtocoloMuse(row({ numero: "3.321/2026" }), REF);
    expect(p?.prazoFinal).toBe("2026-10-23");
    expect(p?.diasAtraso).toBe(32);
    expect(p?.diasRestantes).toBe(-32);
    expect(p?.situacao).toBe("vencido");
    expect(p?.secretaria).toBe("SOSU - Obras");
  });

  it("prorrogada tem 30 dias a mais de prazo", () => {
    const p = mapearProtocoloMuse(row({ prorrogado: true }), REF);
    expect(p?.prazoFinal).toBe("2026-11-22");
    expect(p?.diasAtraso).toBe(2);
  });

  it("e-SIC tem prazo de 20 dias e vence hoje", () => {
    const p = mapearProtocoloMuse(
      row({ tipo: "esic", numero: "1/2026", data_abertura: "2026-11-04" }),
      REF,
    );
    expect(p?.prazoFinal).toBe("2026-11-24");
    expect(p?.diasRestantes).toBe(0);
    expect(p?.diasAtraso).toBe(0);
    expect(p?.situacao).toBe("critico");
  });

  it("concluída não conta atraso e traz a data de conclusão", () => {
    const p = mapearProtocoloMuse(
      row({ status: "concluido", data_conclusao: "2026-10-01" }),
      REF,
    );
    expect(p?.situacao).toBe("concluido");
    expect(p?.diasAtraso).toBe(0);
    expect(p?.dataConclusao).toBe("2026-10-01");
  });

  it("expõe os campos do 1Doc e o endereço atual", () => {
    const p = mapearProtocoloMuse(
      row({
        endereco: "R. Arnoldo Ristow, 422 - Santa Luzia, Brusque - SC, 88357-300",
        onedoc_situacao: "em_andamento",
        onedoc_verificado_em: "2026-11-24T10:00:00.000Z",
      }),
      REF,
    );
    expect(p?.endereco).toBe("R. Arnoldo Ristow, 422 - Santa Luzia, Brusque - SC, 88357-300");
    expect(p?.onedocSituacao).toBe("em_andamento");
    expect(p?.onedocVerificadoEm).toBe("2026-11-24T10:00:00.000Z");
  });

  it("sem secretaria vira 'Sem secretaria'; tipo inválido é descartado", () => {
    expect(mapearProtocoloMuse(row({ secretarias: null }), REF)?.secretaria).toBe(
      "Sem secretaria",
    );
    expect(mapearProtocoloMuse(row({ tipo: "desconhecido" }), REF)).toBeNull();
  });

  it("expõe triagemPendente e localId para a triagem pela API", () => {
    const p = mapearProtocoloMuse(
      row({ triagem_pendente: true, local_id: "loc-farmacia" }),
      REF,
    );
    expect(p?.triagemPendente).toBe(true);
    expect(p?.localId).toBe("loc-farmacia");
    expect(mapearProtocoloMuse(row({}), REF)?.triagemPendente).toBe(false);
    expect(mapearProtocoloMuse(row({}), REF)?.localId).toBeNull();
  });
});

describe("lista genérica de protocolos", () => {
  const linhas = [
    row({ id: "a", numero: "3.768/2026", data_abertura: "2026-10-25" }), // prazo 24/11, vence hoje
    row({ id: "b", numero: "3.700/2026", data_abertura: "2026-10-27" }), // prazo 26/11, 2 dias
    row({ id: "c", numero: "3.600/2026", data_abertura: "2026-10-31" }), // prazo 30/11, 6 dias
    row({ id: "d", numero: "3.500/2026", data_abertura: "2026-11-02" }), // prazo 02/12, 8 dias
    row({ id: "e", numero: "3.321/2026", data_abertura: "2026-09-23" }), // vencida há 32 dias
    row({
      id: "f",
      numero: "3.100/2026",
      data_abertura: "2026-10-25",
      status: "concluido",
      data_conclusao: "2026-11-01",
    }),
  ];

  it("triagemPendente=true só traz os aguardando triagem", () => {
    const linhas2 = [
      row({ id: "a", numero: "4.101/2026", triagem_pendente: true }),
      row({ id: "b", numero: "4.099/2026", triagem_pendente: true }),
      row({ id: "c", numero: "4.096/2026", triagem_pendente: false }),
    ];
    expect(
      classificarProtocolos(linhas2, { triagemPendente: true }, REF).protocolos.map(
        (p) => p.numero,
      ),
    ).toEqual(["4.101/2026", "4.099/2026"]);
    expect(classificarProtocolos(linhas2, { triagemPendente: false }, REF).total).toBe(1);
    expect(classificarProtocolos(linhas2, {}, REF).total).toBe(3);
  });

  it("vencendo=true só traz não concluídos com prazo em 0..7 dias", () => {
    const pag = classificarProtocolos(linhas, { vencendo: true }, REF);
    expect(pag.total).toBe(3);
    expect(pag.protocolos.map((p) => p.numero)).toEqual([
      "3.600/2026",
      "3.700/2026",
      "3.768/2026",
    ]);
  });

  it("busca acha número com ou sem ponto e texto em assunto/descrição", () => {
    expect(classificarProtocolos(linhas, { busca: "3768/2026" }, REF).protocolos).toHaveLength(1);
    expect(classificarProtocolos(linhas, { busca: "3.768/2026" }, REF).protocolos).toHaveLength(1);
    expect(classificarProtocolos(linhas, { busca: "posto de saúde" }, REF).total).toBe(6);
    expect(classificarProtocolos(linhas, { busca: "buraco" }, REF).total).toBe(6);
    expect(classificarProtocolos(linhas, { busca: "inexistente" }, REF).total).toBe(0);
  });

  it("ordena por atraso, prazo ou abertura (padrão)", () => {
    expect(
      classificarProtocolos(linhas, { ordem: "atraso" }, REF).protocolos.map((p) => p.numero)[0],
    ).toBe("3.321/2026");
    expect(
      classificarProtocolos(linhas, { ordem: "prazo" }, REF).protocolos.map((p) => p.numero)[0],
    ).toBe("3.321/2026");
    expect(
      classificarProtocolos(linhas, {}, REF).protocolos.map((p) => p.numero)[0],
    ).toBe("3.500/2026");
  });

  it("pagina com limite/offset e devolve o total filtrado", () => {
    const pag = classificarProtocolos(linhas, { limite: 2, offset: 2 }, REF);
    expect(pag.total).toBe(6);
    expect(pag.limite).toBe(2);
    expect(pag.offset).toBe(2);
    expect(pag.protocolos).toHaveLength(2);
  });

  it("limite é travado em 500 e offset negativo vira 0", () => {
    const pag = classificarProtocolos(linhas, { limite: 9999, offset: -5 }, REF);
    expect(pag.limite).toBe(500);
    expect(pag.offset).toBe(0);
  });
});

describe("resumo operacional do Muse", () => {
  it("conta por status/secretaria, vencendo, atrasadas e aguardando", () => {
    const r = calcularResumoMuse(
      [
        row({ id: "a", data_abertura: "2026-09-23" }), // ouvidoria Obras vencida
        row({ id: "b", secretaria_id: "sec-obras", data_abertura: "2026-11-20" }), // no prazo
        row({
          id: "c",
          tipo: "esic",
          secretaria_id: "sec-saude",
          secretarias: { nome: "Saúde", sigla: null },
          data_abertura: "2026-10-20",
        }), // e-SIC vencido
        row({
          id: "d",
          status: "concluido",
          data_conclusao: "2026-10-01",
          data_abertura: "2026-09-23",
        }),
        row({
          id: "e",
          secretaria_id: "sec-saude",
          secretarias: { nome: "Saúde", sigla: null },
          data_abertura: "2026-11-24",
          triagem_pendente: true,
        }),
      ],
      REF,
    );
    expect(r.total).toBe(5);
    expect(r.porStatus).toEqual({ aberto: 4, em_andamento: 0, concluido: 1 });
    expect(r.porSecretaria).toEqual([
      { secretariaId: "sec-obras", secretaria: "SOSU - Obras", total: 3, abertos: 2, vencidos: 1 },
      { secretariaId: "sec-saude", secretaria: "Saúde", total: 2, abertos: 2, vencidos: 1 },
    ]);
    expect(r.vencendo).toEqual({ hoje: 0, emAte3Dias: 0, emAte7Dias: 0 });
    expect(r.atrasadas).toBe(2);
    // Só a ouvidoria conta aqui — o e-SIC vencido não entra no total do /atrasadas.
    expect(r.atrasadasOuvidoria).toBe(1);
    expect(r.aguardandoResposta).toBe(3);
  });
});

describe("corpo do PATCH de protocolo", () => {
  it("aceita só o endereço, o lote completo e a limpeza com null", () => {
    expect(
      museEditarProtocoloBodySchema.safeParse({
        endereco: "R. Arnoldo Ristow, 422 - Santa Luzia, Brusque - SC, 88357-300",
      }).success,
    ).toBe(true);
    expect(
      museEditarProtocoloBodySchema.safeParse({
        endereco: "Rua X, 1",
        latitude: -27.1,
        longitude: -48.9,
        assunto: "Buraco",
        descricao: "relato",
        solicitante: "João",
        categoria: "reclamacao",
        secretaria_id: "c247febe-5801-4a01-8835-21da7a132a27",
        local_id: null,
      }).success,
    ).toBe(true);
    expect(museEditarProtocoloBodySchema.safeParse({ endereco: null }).success).toBe(true);
  });

  it("rejeita corpo vazio e qualquer campo fora da allow-list", () => {
    expect(museEditarProtocoloBodySchema.safeParse({}).success).toBe(false);
    for (const proibido of [
      { status: "concluido" },
      { data_conclusao: "2026-11-24" },
      { data_abertura: "2026-11-24" },
      { prorrogado: true },
      { tipo: "esic" },
      { numero: "1/2026" },
      { onedoc_situacao: "baixada" },
      { campo_novo: "x" },
    ]) {
      expect(museEditarProtocoloBodySchema.safeParse(proibido).success).toBe(false);
    }
  });

  it("aceita link do 1Doc (direto ou rastreador) e rejeita host estranho", () => {
    expect(
      museEditarProtocoloBodySchema.safeParse({
        url: "https://brusque.1doc.com.br/?pg=doc/ver&hash=abc123&itd=15",
      }).success,
    ).toBe(true);
    expect(
      museEditarProtocoloBodySchema.safeParse({
        url: "http://el.1docmail.com.br/ls/click?upn=abc",
      }).success,
    ).toBe(true);
    expect(
      museEditarProtocoloBodySchema.safeParse({ url: "https://exemplo.com/protocolo/1" })
        .success,
    ).toBe(false);
    expect(
      museEditarProtocoloBodySchema.safeParse({ url: "ftp://brusque.1doc.com.br/x" }).success,
    ).toBe(false);
    expect(museEditarProtocoloBodySchema.safeParse({ url: "nao-e-url" }).success).toBe(false);
    expect(
      museEditarProtocoloBodySchema.safeParse({
        url: "https://brusque.1doc.com.br/?pg=doc/ver&hash=" + "a".repeat(1960),
      }).success,
    ).toBe(false);
  });

  it("rejeita endereço vazio ou acima de 300, coordenadas fora do mapa e categoria inválida", () => {
    expect(museEditarProtocoloBodySchema.safeParse({ endereco: "" }).success).toBe(false);
    expect(museEditarProtocoloBodySchema.safeParse({ endereco: "x".repeat(301) }).success).toBe(
      false,
    );
    expect(museEditarProtocoloBodySchema.safeParse({ latitude: 91 }).success).toBe(false);
    expect(museEditarProtocoloBodySchema.safeParse({ longitude: -181 }).success).toBe(false);
    expect(museEditarProtocoloBodySchema.safeParse({ categoria: "invalida" }).success).toBe(
      false,
    );
    expect(
      museEditarProtocoloBodySchema.safeParse({ secretaria_id: "nao-uuid" }).success,
    ).toBe(false);
  });
});

describe("aplicação da edição (RPC aplicar_edicao_muse)", () => {
  /** Fake mínimo: maybeSingle alterna atual/atualizado; rpc grava os args recebidos. */
  function clienteEdicao(opts: {
    atual: ProtocoloMuseRow | null;
    atualizado?: ProtocoloMuseRow | null;
    rpcErro?: { message: string } | null;
  }) {
    let chamadasMaybe = 0;
    let rpcArgs: { fn: string; args: Record<string, unknown> } | null = null;
    const client = {
      rpcArgs: () => rpcArgs,
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              chamadasMaybe++;
              const data = chamadasMaybe === 1 ? opts.atual : (opts.atualizado ?? opts.atual);
              return { data, error: null };
            },
          }),
        }),
      }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcArgs = { fn, args };
        return opts.rpcErro ? { data: null, error: opts.rpcErro } : { data: null, error: null };
      },
    };
    return client;
  }

  it("atualiza o endereço e devolve anterior, alterados e o protocolo novo", async () => {
    const atual = row({ endereco: "Rua Antiga, 10" });
    const atualizado = row({ endereco: "R. Arnoldo Ristow, 422" });
    const client = clienteEdicao({ atual, atualizado });
    const r = await aplicarEdicaoMuse(
      client as never,
      "id-1",
      { endereco: "R. Arnoldo Ristow, 422" },
      REF,
    );
    expect(r.enderecoAnterior).toBe("Rua Antiga, 10");
    expect(r.camposAlterados).toEqual(["endereco"]);
    expect(r.protocolo.endereco).toBe("R. Arnoldo Ristow, 422");
    expect(client.rpcArgs()?.fn).toBe("aplicar_edicao_muse");
    expect((client.rpcArgs()?.args.p_patch as Record<string, unknown>).endereco).toBe(
      "R. Arnoldo Ristow, 422",
    );
  });

  it("atualiza o link do 1Doc e o inclui nos campos alterados", async () => {
    const atual = row({ url: "http://el.1docmail.com.br/ls/click?upn=antigo" });
    const atualizado = row({ url: "https://brusque.1doc.com.br/?pg=doc/ver&hash=novo" });
    const client = clienteEdicao({ atual, atualizado });
    const r = await aplicarEdicaoMuse(
      client as never,
      "id-1",
      { url: "https://brusque.1doc.com.br/?pg=doc/ver&hash=novo" },
      REF,
    );
    expect(r.camposAlterados).toEqual(["url"]);
    expect(r.protocolo.url).toBe("https://brusque.1doc.com.br/?pg=doc/ver&hash=novo");
    expect((client.rpcArgs()?.args.p_patch as Record<string, unknown>).url).toBe(
      "https://brusque.1doc.com.br/?pg=doc/ver&hash=novo",
    );
  });

  it("categoria esic vira pedido_informacao na gravação, como no painel", async () => {
    const client = clienteEdicao({ atual: row({}) });
    await aplicarEdicaoMuse(client as never, "id-1", { categoria: "esic" }, REF);
    expect((client.rpcArgs()?.args.p_patch as Record<string, unknown>).categoria).toBe(
      "pedido_informacao",
    );
  });

  it("descricao e solicitante vazios viram null, como no painel", async () => {
    const client = clienteEdicao({ atual: row({}) });
    await aplicarEdicaoMuse(
      client as never,
      "id-1",
      { descricao: "", solicitante: "" },
      REF,
    );
    const patch = client.rpcArgs()?.args.p_patch as Record<string, unknown>;
    expect(patch.descricao).toBeNull();
    expect(patch.solicitante).toBeNull();
  });

  it("protocolo inexistente não chama a RPC", async () => {
    const client = clienteEdicao({ atual: null });
    await expect(
      aplicarEdicaoMuse(client as never, "id-1", { endereco: "Rua X, 1" }, REF),
    ).rejects.toThrow("Protocolo não encontrado");
    expect(client.rpcArgs()).toBeNull();
  });

  it("erro da RPC (secretaria/local) é repassado para a rota mapear o status", async () => {
    const client = clienteEdicao({
      atual: row({}),
      rpcErro: { message: "Secretaria não encontrada" },
    });
    await expect(
      aplicarEdicaoMuse(client as never, "id-1", {
        secretaria_id: "c247febe-5801-4a01-8835-21da7a132a27",
      }, REF),
    ).rejects.toThrow("Secretaria não encontrada");
  });
});

describe("leituras com cliente falso", () => {
  it("lista protocolos aplicando os filtros de banco e pagina em memória", async () => {
    const chamadas: string[] = [];
    const chain: Record<string, (...a: never[]) => unknown> = {
      eq: ((k: string, v: unknown) => {
        chamadas.push(`eq:${k}=${v}`);
        return chain;
      }) as never,
      order: (() => chain) as never,
      range: (() => Promise.resolve({ data: [row({ id: "a" }), row({ id: "b" })], error: null })) as never,
    };
    const client = { from: () => ({ select: () => chain }) };
    const pag = await listarProtocolosMuse(client as never, {
      secretariaId: "sec-obras",
      status: "aberto",
      limite: 1,
      offset: 1,
      refDate: REF,
    });
    expect(chamadas).toContain("eq:secretaria_id=sec-obras");
    expect(chamadas).toContain("eq:status=aberto");
    expect(pag.total).toBe(2);
    expect(pag.protocolos).toHaveLength(1);
  });

  it("busca por id devolve null quando não existe", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    };
    expect(await buscarProtocoloMuse(client as never, "id-1", REF)).toBeNull();
  });

  it("lista secretarias por nome com id e sigla", async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: async () => ({
            data: [
              { id: "s1", nome: "SOSU - Obras", sigla: "SOSU" },
              { id: "s2", nome: "Saúde", sigla: null },
            ],
            error: null,
          }),
        }),
      }),
    };
    expect(await listarSecretariasMuse(client as never)).toEqual([
      { id: "s1", nome: "SOSU - Obras", sigla: "SOSU" },
      { id: "s2", nome: "Saúde", sigla: null },
    ]);
  });

  it("lista locais com secretaria e filtra por secretariaId", async () => {
    const chamadas: string[] = [];
    const dados = [
      {
        id: "l1",
        nome: "Assistência Farmacêutica",
        secretaria_id: "sec-saude",
        secretarias: { nome: "Saúde" },
      },
      {
        id: "l2",
        nome: "UBS São Luiz",
        secretaria_id: "sec-saude",
        secretarias: { nome: "Saúde" },
      },
    ];
    const chain: Record<string, (...a: never[]) => unknown> = {
      eq: ((k: string, v: unknown) => {
        chamadas.push(`eq:${k}=${v}`);
        return chain;
      }) as never,
      order: (() => chain) as never,
      then: ((resolve: (v: unknown) => void) =>
        resolve({ data: dados, error: null })) as never,
    };
    const client = { from: () => ({ select: () => chain }) };
    expect(await listarLocaisMuse(client as never, "sec-saude")).toEqual([
      {
        id: "l1",
        nome: "Assistência Farmacêutica",
        secretariaId: "sec-saude",
        secretaria: "Saúde",
      },
      { id: "l2", nome: "UBS São Luiz", secretariaId: "sec-saude", secretaria: "Saúde" },
    ]);
    expect(chamadas).toContain("eq:secretaria_id=sec-saude");
  });
});
