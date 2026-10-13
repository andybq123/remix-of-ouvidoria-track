import { describe, it, expect } from "vitest";
import { corrigirAcentos } from "./corrigir-acentos";
describe("corrigirAcentos", () => {
  it("corrige caractere de substituição", () => expect(corrigirAcentos("Entulho em via p\uFFFDblica")).toBe("Entulho em via pública"));
  it("corrige UTF-8 lido como Latin-1", () => expect(corrigirAcentos("via pÃºblica")).toBe("via pública"));
  it("mantém maiúsculas", () => expect(corrigirAcentos("ILUMINA\uFFFD\uFFFDO P\uFFFDBLICA")).toBe("ILUMINAÇÃO PÚBLICA"));
  it("não altera texto correto", () => expect(corrigirAcentos("Saúde e água")).toBe("Saúde e água"));
});
