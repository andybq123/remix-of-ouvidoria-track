import { describe, it, expect } from "vitest";
// @ts-expect-error módulo JS compartilhado com o agente da VPS
import { analisarTexto1doc, atualizacaoProtocolo, precisaIA, validarRespostaIA } from "../../local-docker/agente-1doc/parse.mjs";

const EXEMPLO = `17/09/2026 14:16:49

**************************** SETA - OUV deu baixa manualmente no prazo Resposta final em 17/09/2026 às 14:09:49.

17/09/2026 14:16:55

**************************** SETA - OUV arquivou.`;

describe("agente 1Doc", () => {
  it("lê a baixa com data e hora do texto", () => {
    const a = analisarTexto1doc(EXEMPLO);
    expect(a.baixado_em).toBe("2026-09-17T17:09:49.000Z");
    expect(a.setor).toBe("SETA - OUV");
  });
  it("lê o arquivamento pelo carimbo anterior", () => {
    const a = analisarTexto1doc(EXEMPLO);
    expect(a.arquivado_em).toBe("2026-09-17T17:16:55.000Z");
    expect(a.situacao).toBe("arquivada");
  });
  it("sem baixa nem arquivamento fica em andamento", () => {
    expect(analisarTexto1doc("17/09/2026 10:00:00 Encaminhou para Obras").situacao).toBe("em_andamento");
  });
  it("conclui com a data da baixa", () => {
    const u = atualizacaoProtocolo({ status: "em_andamento" }, analisarTexto1doc(EXEMPLO));
    expect(u.status).toBe("concluido");
    expect(u.data_conclusao).toBe("2026-09-17");
  });
  it("sem baixa usa a data do arquivamento", () => {
    const u = atualizacaoProtocolo({ status: "aberto" }, analisarTexto1doc("20/09/2026 08:00:00 SETA arquivou."));
    expect(u.data_conclusao).toBe("2026-09-20");
  });
  it("não sobrescreve protocolo já concluído", () => {
    const u = atualizacaoProtocolo({ status: "concluido" }, analisarTexto1doc(EXEMPLO));
    expect(u.status).toBeUndefined();
    expect(u.data_conclusao).toBeUndefined();
  });
  it("coleta o endereço sem a parte do CEP", () => {
    const a = analisarTexto1doc("Endereço: R. João XXIII, Brusque - SC, 88357, Brasil. . CEP: 88357 / Cidade: Brusque, Santa Catarina");
    expect(a.endereco).toBe("R. João XXIII, Brusque - SC, 88357, Brasil");
  });
  it("só preenche endereço quando o protocolo não tem", () => {
    const a = analisarTexto1doc("Endereço: Rua Azambuja, Brusque - SC");
    expect(atualizacaoProtocolo({ status: "aberto", endereco: "" }, a).endereco).toBe("Rua Azambuja, Brusque - SC");
    expect(atualizacaoProtocolo({ status: "aberto", endereco: "Rua X" }, a).endereco).toBeUndefined();
  });
  it("IA quando encerrada sem data", () => {
    const tx = "SETA deu baixa na solicitação";
    expect(precisaIA(tx, analisarTexto1doc(tx), { endereco: "Rua X" })).toBe(true);
  });
  it("sem IA quando a regra leu a data", () => {
    expect(precisaIA(EXEMPLO, analisarTexto1doc(EXEMPLO), { endereco: "Rua X" })).toBe(false);
  });
  it("sem IA para endereço quando o protocolo já tem", () => {
    const tx = "Local: Rua Azambuja 100";
    expect(precisaIA(tx, analisarTexto1doc(tx), { endereco: "Rua X" })).toBe(false);
    expect(precisaIA(tx, analisarTexto1doc(tx), { endereco: "" })).toBe(true);
  });
  it("descarta data inválida da IA", () => {
    const v = validarRespostaIA({ baixado_em: "ontem", arquivado_em: "2099-01-01", endereco: "Rua Azambuja, 100" }, new Date("2026-10-19"));
    expect(v.baixado_em).toBeNull();
    expect(v.arquivado_em).toBeNull();
    expect(v.endereco).toBe("Rua Azambuja, 100");
  });
});
