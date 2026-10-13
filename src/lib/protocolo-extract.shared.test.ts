import { describe, expect, it } from "vitest";
import { detectarPedidoEsic } from "./protocolo-extract.shared";

describe("detectarPedidoEsic", () => {
  it("identifica notificações com e-SIC e número de pedido", () => {
    expect(detectarPedidoEsic("Pedido de e-SIC 026/2026 recebido")).toBe(true);
  });

  it("aceita variações de grafia e pedido de acesso à informação", () => {
    expect(detectarPedidoEsic("e SIC 026/2026")).toBe(true);
    expect(detectarPedidoEsic("Pedido de acesso à informação recebido")).toBe(true);
    expect(detectarPedidoEsic("Pedido de LAI 026/2026")).toBe(true);
  });

  it("não classifica uma notificação comum de Ouvidoria como e-SIC", () => {
    expect(detectarPedidoEsic("Nova Ouvidoria recebida — Iluminação e Energia")).toBe(false);
  });
});
