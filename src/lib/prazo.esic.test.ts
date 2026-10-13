import { describe, expect, it } from "vitest";
import { calcularPrazo, categoriaDoProtocolo, categoriaPersistida } from "./prazo";

describe("e-SIC", () => {
  it("mantém categoria estatística própria sem alterar a categoria salva", () => {
    expect(categoriaDoProtocolo("esic", "pedido_informacao")).toBe("esic");
    expect(categoriaPersistida("esic", "esic")).toBe("pedido_informacao");
  });

  it("preserva categorias de protocolos não e-SIC", () => {
    expect(categoriaDoProtocolo("ouvidoria", "reclamacao")).toBe("reclamacao");
  });

  it("conserva os prazos de 20 dias e prorrogação de 10 dias", () => {
    expect(
      calcularPrazo({ tipo: "esic", data_abertura: "2026-01-01", prorrogado: false }).diasTotais,
    ).toBe(20);
    expect(
      calcularPrazo({ tipo: "esic", data_abertura: "2026-01-01", prorrogado: true }).diasTotais,
    ).toBe(30);
  });
});
