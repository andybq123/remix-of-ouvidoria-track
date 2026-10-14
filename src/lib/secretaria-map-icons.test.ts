import { describe, expect, it } from "vitest";
import { isCustomMapEmoji, obterIconeSecretaria } from "@/lib/secretaria-map-icons";

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

  it("permite escolhas independentes para Saúde e Obras", () => {
    expect(obterIconeSecretaria("🩺", "saude").emoji).toBe("🩺");
    expect(obterIconeSecretaria("🏗️", "obras").emoji).toBe("🏗️");
    expect(obterIconeSecretaria(null, "saude").emoji).toBe("🏥");
  });

  it("rejeita texto, múltiplos emojis e conteúdo HTML nos ícones personalizados", () => {
    expect(isCustomMapEmoji("🏗️")).toBe(true);
    expect(isCustomMapEmoji("👩‍⚕️")).toBe(true);
    expect(isCustomMapEmoji("🏥🚧")).toBe(false);
    expect(isCustomMapEmoji('<img src=x onerror="alert(1)">🏥')).toBe(false);
    expect(isCustomMapEmoji("hospital")).toBe(false);
    expect(obterIconeSecretaria("<script>", "saude").key).toBe("saude");
  });
});
