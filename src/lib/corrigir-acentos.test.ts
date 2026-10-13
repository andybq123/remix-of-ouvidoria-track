import { describe, it, expect } from "vitest";
import { corrigirAcentos } from "./corrigir-acentos";
describe("corrigirAcentos", () => {
  it("corrige caractere de substituição", () => expect(corrigirAcentos("Entulho em via p\uFFFDblica")).toBe("Entulho em via pública"));
  it("corrige os três assuntos reportados", () => {
    expect(corrigirAcentos("Ilumina\uFFFD\uFFFDo e Energia")).toBe("Iluminação e Energia");
    expect(corrigirAcentos("Conduta de Funcion\uFFFDrios")).toBe("Conduta de Funcionários");
    expect(corrigirAcentos("Entulho em via p\uFFFDblica")).toBe("Entulho em via pública");
  });
  it("corrige os três assuntos quando o UTF-8 foi lido como Latin-1", () => {
    expect(corrigirAcentos("IluminaÃ§Ã£o e Energia")).toBe("Iluminação e Energia");
    expect(corrigirAcentos("Conduta de FuncionÃ¡rios")).toBe("Conduta de Funcionários");
    expect(corrigirAcentos("Entulho em via pÃºblica")).toBe("Entulho em via pública");
  });
  it("corrige UTF-8 lido como Latin-1", () => expect(corrigirAcentos("via pÃºblica")).toBe("via pública"));
  it("mantém maiúsculas", () => expect(corrigirAcentos("ILUMINA\uFFFD\uFFFDO P\uFFFDBLICA")).toBe("ILUMINAÇÃO PÚBLICA"));
  it("não altera texto correto", () => expect(corrigirAcentos("Saúde e água")).toBe("Saúde e água"));
});
