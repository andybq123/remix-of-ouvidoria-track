import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveNumeroEsic } from "./esic";

const mock = vi.hoisted(() => ({
  tables: {
    protocolos: [] as any[],
    email_inbox_log: [] as any[],
    protocolo_historico: [] as any[],
  },
  ai: vi.fn(),
  rpc: vi.fn(),
}));

class Query {
  private filters: ((row: any) => boolean)[] = [];
  private operation = "select";
  private payload: any;
  constructor(private table: keyof typeof mock.tables) {}
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  neq(key: string, value: unknown) {
    this.filters.push((row) => row[key] !== value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  is(key: string, value: unknown) {
    this.filters.push((row) => (row[key] ?? null) === value);
    return this;
  }
  update(payload: any) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }
  insert(payload: any) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }
  private result(single = false) {
    let rows = mock.tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
    if (this.operation === "insert") {
      const row = { id: `${this.table}-${mock.tables[this.table].length + 1}`, ...this.payload };
      mock.tables[this.table].push(row);
      rows = [row];
    } else if (this.operation === "update") {
      rows.forEach((row) => Object.assign(row, this.payload));
    }
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  single() {
    return Promise.resolve(this.result(true));
  }
  maybeSingle() {
    return Promise.resolve(this.result(true));
  }
  then(resolve: any, reject: any) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: keyof typeof mock.tables) => new Query(table), rpc: mock.rpc },
}));
vi.mock("./ai-chat.server", () => ({ aiChatDetailed: mock.ai }));

import { ingerirEmail } from "./protocolo-ingest.server";

const conta = { id: "conta-teste", secretaria_id: "secretaria-vinculada", created_by: null };
const entrada = {
  account: conta,
  remetente: "Prefeitura <notificacao@1doc.com.br>",
  destinatario: "ouvidoria@exemplo.local",
  assunto: "Pedido de e-SIC 026/2026 recebido",
  corpo:
    "Novo Protocolo recebido.\nNº: 026/2026\nAssunto: Pedido\nDe: Sandi E Oliveira Advogados\nPara: SETA - OUV - Ouvidoria Geral",
  externalId: "mensagem-1",
};

beforeEach(() => {
  Object.values(mock.tables).forEach((rows) => rows.splice(0));
  mock.ai.mockReset();
  mock.rpc.mockReset().mockImplementation((name, args) => ({
    maybeSingle: async () => {
      if (name !== "protocolo_esic_por_numero") throw new Error("RPC inesperada");
      const rows = mock.tables.protocolos.filter(
        (p) =>
          p.tipo === "esic" && chaveNumeroEsic(p.numero_esic) === chaveNumeroEsic(args.p_numero),
      );
      return {
        data: rows[0] ?? null,
        error: rows.length > 1 ? { message: "mais de um pedido e-SIC" } : null,
      };
    },
  }));
});

describe("ingerirEmail: pedidos e-SIC", () => {
  it("insere e-SIC com número próprio, sem IA e sempre em triagem, mesmo com conta vinculada", async () => {
    const res = await ingerirEmail(entrada);
    expect(res.ok).toBe(true);
    expect(mock.ai).not.toHaveBeenCalled();
    expect(mock.tables.protocolos[0]).toMatchObject({
      numero_esic: "0.026/2026",
      tipo: "esic",
      categoria: "pedido_informacao",
      triagem_pendente: true,
      secretaria_id: null,
      local_id: null,
      solicitante: "Sandi E Oliveira Advogados",
    });
    expect(mock.tables.protocolos[0].numero).not.toBe("0.026/2026");
    expect(mock.tables.email_inbox_log[0]).toMatchObject({ status: "processado", erro: null });
  });
  it("não duplica uma mensagem já processada", async () => {
    await ingerirEmail(entrada);
    expect((await ingerirEmail(entrada)).ok).toBe(true);
    expect(mock.tables.protocolos).toHaveLength(1);
    expect(mock.tables.email_inbox_log).toHaveLength(1);
  });
  it("reconhece atualização com zeros diferentes sem reabrir triagem nem concluir por palavras do relato", async () => {
    await ingerirEmail(entrada);
    mock.tables.protocolos[0].triagem_pendente = false;
    const res = await ingerirEmail({
      ...entrada,
      externalId: "mensagem-2",
      assunto: "Pedido de e-SIC 26/2026 atualizado",
      corpo: "Favor concluir a análise para atendimento do pedido.",
    });
    expect(res.ok).toBe(true);
    expect(mock.tables.protocolos).toHaveLength(1);
    expect(mock.tables.protocolos[0].triagem_pendente).toBe(false);
    expect(mock.tables.protocolos[0].status).not.toBe("concluido");
    expect(mock.tables.protocolo_historico[0].acao).toBe("atualizacao");
  });
  it("não confunde número oficial e-SIC com um protocolo de Ouvidoria", async () => {
    mock.tables.protocolos.push({
      id: "ouvidoria",
      numero: "0.026/2026",
      tipo: "ouvidoria",
      status: "aberto",
    });
    expect((await ingerirEmail(entrada)).ok).toBe(true);
    expect(mock.tables.protocolos).toHaveLength(2);
    expect(mock.tables.protocolos[0].status).toBe("aberto");
    expect(mock.tables.protocolos[1].numero_esic).toBe("0.026/2026");
  });
  it("registra erro recuperável, sem criar pedido com número inventado", async () => {
    const res = await ingerirEmail({
      ...entrada,
      assunto: "Pedido de e-SIC recebido",
      corpo: "Novo Protocolo recebido.\nAssunto: Pedido",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Número do pedido e-SIC não identificado");
    expect(mock.tables.protocolos).toHaveLength(0);
    expect(mock.tables.email_inbox_log[0].status).toBe("erro");
    expect(mock.ai).not.toHaveBeenCalled();
  });
  it("não insere silenciosamente outra cópia se existirem duplicatas legadas", async () => {
    mock.tables.protocolos.push(
      { id: "legado-1", tipo: "esic", numero: "1001/2026", numero_esic: "026/2026" },
      { id: "legado-2", tipo: "esic", numero: "1002/2026", numero_esic: "26/2026" },
    );
    expect((await ingerirEmail(entrada)).ok).toBe(false);
    expect(mock.tables.protocolos).toHaveLength(2);
    expect(mock.tables.email_inbox_log[0].status).toBe("erro");
  });
});
