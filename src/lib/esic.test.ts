import { describe, expect, it } from "vitest";
import { acaoNotificacaoEsic, chaveNumeroEsic, extrairPedidoEsic } from "./esic";
import { detectarPedidoEsic } from "./protocolo-extract.shared";

const exemplo = `Pedido de e-SIC 026/2026 recebido
Caixa de entrada
Prefeitura Municipal de Brusque <notificacao@1doc.com.br>
Anexos
sex., 12 de jun., 15:36
Prefeitura Municipal de BrusqueNovo Protocolo recebido.
Nº: 026/2026
Assunto: Pedido
De: Sandi E Oliveira Advogados
Para: SETA - OUV - Ouvidoria Geral`;

describe("notificações e-SIC", () => {
  it("extrai o número e os campos do exemplo real sem IA", () => {
    expect(extrairPedidoEsic(exemplo)).toMatchObject({
      numero: "026/2026",
      assunto: "Pedido",
      solicitante: "Sandi E Oliveira Advogados",
      destinatario: "SETA - OUV - Ouvidoria Geral",
      tipo: "esic",
      categoria: "pedido_informacao",
    });
  });
  it("prioriza o número oficial no título sobre o cabeçalho interno", () => {
    expect(extrairPedidoEsic(exemplo.replace("Nº: 026/2026", "Nº: 999/2026"))?.numero).toBe(
      "026/2026",
    );
  });
  it("extrai os mesmos campos quando o corpo está em uma única linha", () => {
    expect(
      extrairPedidoEsic(
        "Pedido de e-SIC 026/2026 recebido\nNovo Protocolo recebido. Nº: 026/2026 Assunto: Pedido De: Sandi E Oliveira Advogados Para: SETA - OUV - Ouvidoria Geral",
      ),
    ).toMatchObject({
      numero: "026/2026",
      assunto: "Pedido",
      solicitante: "Sandi E Oliveira Advogados",
      destinatario: "SETA - OUV - Ouvidoria Geral",
    });
  });
  it("reconhece notificação LAI como e-SIC", () => {
    expect(extrairPedidoEsic(exemplo.replace("Pedido de e-SIC", "LAI"))?.tipo).toBe("esic");
  });
  it("não inventa número quando só há identificação do canal", () => {
    expect(
      extrairPedidoEsic("Pedido de e-SIC recebido\nNovo Protocolo recebido.\nAssunto: Pedido")
        ?.numero,
    ).toBe("");
  });
  it("não converte uma Ouvidoria explícita que cita e-SIC no relato", () => {
    const email =
      "Assunto: Ouvidoria 26/2026: Solicitação\nNova Ouvidoria recebida\nRelato: como consultar o e-SIC?";
    expect(detectarPedidoEsic(email)).toBe(false);
    expect(extrairPedidoEsic(email)).toBeNull();
  });
  it("compara zeros e pontos sem mudar a grafia exibida", () => {
    for (const numero of ["026/2026", "26/2026", "00026 / 2026", "0.026/2026"]) {
      expect(chaveNumeroEsic(numero)).toBe("26/2026");
    }
    expect(chaveNumeroEsic("000/2026")).toBe("0/2026");
    expect(chaveNumeroEsic("026/2025")).not.toBe(chaveNumeroEsic("026/2026"));
  });
  it("não conclui pedido só por palavras genéricas ou por estar respondido", () => {
    expect(
      acaoNotificacaoEsic("Pedido de e-SIC 026/2026 recebido — solicitação de atendimento"),
    ).toBe("atualizacao");
    expect(acaoNotificacaoEsic("Pedido de e-SIC 026/2026 respondido")).toBe("atualizacao");
    expect(acaoNotificacaoEsic("Pedido de e-SIC 026/2026 concluído")).toBe("conclusao");
    expect(acaoNotificacaoEsic("Pedido de e-SIC 026/2026 encerrado")).toBe("conclusao");
  });
});
