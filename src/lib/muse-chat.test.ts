import { describe, expect, it } from "vitest";
import {
  acaoConferirProtocolo,
  classificarIntencao,
  destinoNavegacao,
  extrairNumeroProtocolo,
  extrairSecretaria,
  respostaDeterministica,
  type ResumoChat,
} from "./muse-chat";

function resumo(over: Partial<ResumoChat> = {}): ResumoChat {
  return {
    total: 10,
    ativos: 6,
    concluidos: 4,
    vencidos: 2,
    venceHoje: 1,
    vence3Dias: 2,
    vencendoSemana: 3,
    aguardando: 3,
    porSecretaria: [
      { nome: "Saúde", total: 6, vencidos: 2 },
      { nome: "Obras", total: 4, vencidos: 0 },
    ],
    atrasadasTop: [
      {
        id: "a",
        numero: "3.321/2026",
        assunto: "Foco de dengue",
        secretaria: "Saúde",
        diasAtraso: 32,
        prazoFinal: "2026-10-23",
        url: "https://brusque.1doc.com.br/x",
      },
    ],
    vencendoTop: [
      {
        id: "b",
        numero: "3.802/2026",
        assunto: "Conduta de Funcionários",
        secretaria: "Saúde",
        diasAtraso: -2,
        prazoFinal: "2026-12-02",
        url: "https://brusque.1doc.com.br/y",
      },
    ],
    protocolo: null,
    secretariaBuscada: null,
    ultimoJob: null,
    ...over,
  };
}

describe("chat do Assistente Muse — intenção", () => {
  it("pergunta sobre atrasadas roteia para atrasadas e sugere conferência", () => {
    expect(classificarIntencao("Quantas ouvidorias estão atrasadas?")).toBe("atrasadas");
    expect(classificarIntencao("Confere as atrasadas no 1Doc")).toBe("atrasadas");
    const r = respostaDeterministica("atrasadas", resumo());
    expect(r).toContain("2 ouvidoria(s) atrasada(s)");
    expect(r).toContain("3.321/2026");
    expect(r).toContain("conferir");
  });

  it("pergunta sobre prazo roteia para vencendo e usa prazo.ts", () => {
    expect(classificarIntencao("Quais vencem esta semana?")).toBe("vencendo");
    expect(classificarIntencao("O que vence hoje?")).toBe("vencendo");
    const r = respostaDeterministica("vencendo", resumo());
    expect(r).toContain("3 vence(m) esta semana");
    expect(r).toContain("sendo 1 hoje");
    expect(r).toContain("3.802/2026");
  });

  it("pergunta por status roteia para status e usa os totais", () => {
    expect(classificarIntencao("Quantos protocolos estão em andamento?")).toBe("status");
    expect(classificarIntencao("Quantos já foram concluídos?")).toBe("status");
    const r = respostaDeterministica("status", resumo());
    expect(r).toContain("6 em andamento");
    expect(r).toContain("4 concluídos");
    expect(r).toContain("3 aguardando resposta");
  });

  it("pedido para abrir uma tela roteia para navegação com destino", () => {
    expect(classificarIntencao("Abrir a tela de Atrasados")).toBe("navegacao");
    expect(destinoNavegacao("Abrir a tela de Atrasados")).toEqual({
      rota: "/atrasados",
      rotulo: "Atrasados",
    });
    expect(destinoNavegacao("Me leva para o Agente 1Doc")).toEqual({
      rota: "/agente-1doc",
      rotulo: "Agente 1Doc",
    });
    expect(destinoNavegacao("Abrir Configurações > IA")).toEqual({
      rota: "/ia-config",
      rotulo: "Configurações > IA",
    });
    // Pergunta de dados não é navegação, mesmo citando atrasadas.
    expect(classificarIntencao("Quantas ouvidorias estão atrasadas?")).toBe("atrasadas");
    expect(destinoNavegacao("Quantas ouvidorias estão atrasadas?")).toBeNull();
    const r = respostaDeterministica("navegacao", resumo());
    expect(r).toContain("botão abaixo");
  });

  it("pergunta sobre a última conferência roteia e usa o último job", () => {
    expect(classificarIntencao("Qual foi a última conferência no 1Doc?")).toBe(
      "ultima-conferencia",
    );
    expect(classificarIntencao("Como está a integração do Muse?")).toBe("ultima-conferencia");
    const comJob = respostaDeterministica(
      "ultima-conferencia",
      resumo({
        ultimoJob:
          "Última conferência do Muse: concluido (5/5 conferidas, 2 concluídas) em 2026-11-24.",
      }),
    );
    expect(comJob).toContain("5/5 conferidas");
    const semJob = respostaDeterministica("ultima-conferencia", resumo());
    expect(semJob).toContain("Nenhuma conferência pedida pelo Muse ainda");
  });

  it("secretaria citada na pergunta é extraída e a resposta foca nela", () => {
    expect(extrairSecretaria("Quantas ouvidorias da Saúde?", ["Saúde", "Obras"])).toBe("Saúde");
    expect(extrairSecretaria("E as de Obras?", ["Saúde", "Obras"])).toBe("Obras");
    expect(extrairSecretaria("Qual secretaria tem mais atrasadas?", ["Saúde", "Obras"])).toBeNull();
    const r = respostaDeterministica("secretaria", resumo({ secretariaBuscada: "Saúde" }));
    expect(r).toContain("Saúde: 6 protocolo(s) no total, 2 atrasado(s)");
  });

  it("secretaria no padrão SIGLA - Nome casa pelo miolo, pela sigla ou por palavra", () => {
    const nomes = [
      "SMS - SECRETARIA DE SAÚDE",
      "SOSU - SECRETARIA DE OBRAS E SERVIÇOS URBANOS",
      "SEDU - SECRETARIA DE EDUCAÇÃO",
    ];
    expect(extrairSecretaria("Quantas ouvidorias da Saúde?", nomes)).toBe(
      "SMS - SECRETARIA DE SAÚDE",
    );
    expect(extrairSecretaria("Quantas da SMS?", nomes)).toBe("SMS - SECRETARIA DE SAÚDE");
    expect(extrairSecretaria("E as de Obras?", nomes)).toBe(
      "SOSU - SECRETARIA DE OBRAS E SERVIÇOS URBANOS",
    );
    expect(extrairSecretaria("Qual secretaria tem mais atrasadas?", nomes)).toBeNull();
  });

  it("número de protocolo roteia para protocolo e extrai o número", () => {
    expect(extrairNumeroProtocolo("Como está a 3.321/2026?")).toBe("3321/2026");
    expect(extrairNumeroProtocolo("E a 3.677/2026, já foi baixada?")).toBe("3677/2026");
    expect(classificarIntencao("Como está a 3.321/2026?")).toBe("protocolo");
    const r = respostaDeterministica(
      "protocolo",
      resumo({
        protocolo: {
          id: "a",
          numero: "3.321/2026",
          assunto: "Foco de dengue",
          secretaria: "Saúde",
          status: "concluido",
          situacao: "concluido",
          dias: 32,
          prazoFinal: "2026-10-23",
          url: "https://brusque.1doc.com.br/x",
        },
      }),
    );
    expect(r).toContain("3.321/2026");
    expect(r).toContain("concluido");
  });

  it("resumo e secretaria usam os totais do sistema", () => {
    expect(classificarIntencao("Me dá um resumo")).toBe("resumo");
    expect(classificarIntencao("Qual secretaria tem mais atrasadas?")).toBe("secretaria");
    expect(respostaDeterministica("resumo", resumo())).toContain("10 protocolo(s)");
    expect(respostaDeterministica("secretaria", resumo())).toContain(
      "Saúde (6 no total, 2 atrasado(s))",
    );
  });

  it("sem atrasadas, a resposta diz isso em vez de inventar", () => {
    const r = respostaDeterministica("atrasadas", resumo({ vencidos: 0, atrasadasTop: [] }));
    expect(r).toContain("Nenhuma ouvidoria está atrasada");
  });
});

describe("chat do Assistente Muse — conferência unitária no 1Doc", () => {
  const protocoloAberto = {
    id: "proto-1",
    numero: "3.321/2026",
    assunto: "Foco de dengue",
    secretaria: "Saúde",
    status: "aberto",
    situacao: "vencido",
    dias: -32,
    prazoFinal: "2026-10-23",
    url: "https://brusque.1doc.com.br/x",
  };

  it("protocolo aberto com link do 1Doc vira ação unitária para admin", () => {
    expect(acaoConferirProtocolo(protocoloAberto, true)).toEqual({
      tipo: "conferir-protocolo",
      protocoloId: "proto-1",
      numero: "3.321/2026",
      total: 1,
    });
  });

  it("protocolo sem link do 1Doc não tem ação", () => {
    expect(acaoConferirProtocolo({ ...protocoloAberto, url: null }, true)).toBeNull();
    expect(
      acaoConferirProtocolo({ ...protocoloAberto, url: "https://exemplo.com/doc" }, true),
    ).toBeNull();
  });

  it("protocolo já concluído não tem ação", () => {
    expect(acaoConferirProtocolo({ ...protocoloAberto, status: "concluido" }, true)).toBeNull();
  });

  it("sem admin ou sem protocolo não tem ação", () => {
    expect(acaoConferirProtocolo(protocoloAberto, false)).toBeNull();
    expect(acaoConferirProtocolo(null, true)).toBeNull();
  });

  it("a resposta explica cada caso: pode conferir, sem link ou já concluído", () => {
    expect(respostaDeterministica("protocolo", resumo({ protocolo: protocoloAberto }))).toContain(
      "Posso conferir essa ouvidoria no 1Doc",
    );
    expect(
      respostaDeterministica("protocolo", resumo({ protocolo: { ...protocoloAberto, url: null } })),
    ).toContain("não tem link do 1Doc");
    expect(
      respostaDeterministica(
        "protocolo",
        resumo({ protocolo: { ...protocoloAberto, status: "concluido" } }),
      ),
    ).toContain("já está concluída");
  });
});
