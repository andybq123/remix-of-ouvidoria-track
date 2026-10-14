import { describe, expect, it } from "vitest";
import { obterIconeSecretaria } from "@/lib/secretaria-map-icons";

describe("obterIconeSecretaria", () => {
  it("usa um ícone de Obras quando o valor está no modo automático", () => {
    expect(obterIconeSecretaria(null, "obras")).toMatchObject({
      key: "obras",
      emoji: "🚧",
      label: "Obras",
    });
  });

  it("usa o ícone escolhido para a secretaria", () => {
    expect(obterIconeSecretaria("transporte", "obras")).toMatchObject({
      key: "transporte",
      emoji: "🚌",
      label: "Transporte",
    });
  });

  it("usa Administração para setores sem ícone automático", () => {
    expect(obterIconeSecretaria(null, null)).toMatchObject({ key: "administracao", emoji: "🏛️" });
  });
});
