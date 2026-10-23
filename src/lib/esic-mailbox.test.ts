import { describe, expect, it } from "vitest";
import { extrairNumerosEsicTexto, intervaloEsic, pastasEsic } from "./esic-mailbox";

describe("varredura completa e-SIC", () => {
  it("percorre mais de duas páginas até o último UID sem limite total", () => {
    let next: number | null = 1;
    const lidos: number[] = [];
    while (next !== null) {
      const r = intervaloEsic(next, 583);
      for (let n = r.inicio; n <= r.fim; n++) lidos.push(n);
      next = r.proximo;
    }
    expect(lidos).toHaveLength(583);
    expect(lidos[0]).toBe(1);
    expect(lidos[582]).toBe(583);
    expect(new Set(lidos).size).toBe(583);
  });
  it("inclui Gmail All Mail, spam e lixeira sem reler os mesmos marcadores", () => {
    const pastas = [
      { path: "INBOX", flags: new Set<string>() },
      { path: "Todos", specialUse: "\\All", flags: new Set<string>() },
      { path: "Spam", specialUse: "\\Junk", flags: new Set<string>() },
      { path: "Lixeira", specialUse: "\\Trash", flags: new Set<string>() },
    ];
    expect(pastasEsic(pastas).map(p => p.path)).toEqual(["Todos", "Spam", "Lixeira"]);
  });
  it("percorre todas as pastas selecionáveis em caixas sem All Mail", () => {
    expect(pastasEsic([
      { path: "INBOX", flags: new Set<string>() },
      { path: "Arquivo 2025", flags: new Set<string>() },
      { path: "Arquivo 2026", flags: new Set<string>() },
      { path: "Pasta mãe", flags: new Set(["\\Noselect"]) },
    ]).map(p => p.path)).toEqual(["INBOX", "Arquivo 2025", "Arquivo 2026"]);
  });
});

describe("busca de e-SIC por números", () => {
  it("extrai números de texto livre, normalizando zeros e pontos e removendo duplicados", () => {
    expect(extrairNumerosEsicTexto("092/2026, 93/2026 e 0.094/2026; repetir 092/2026"))
      .toEqual(["0.092/2026", "0.093/2026", "0.094/2026"]);
  });
  it("ignora trechos sem ano de quatro dígitos e textos sem número", () => {
    expect(extrairNumerosEsicTexto("protocolo 12/99 e 5/20266, nada mais")).toEqual([]);
  });
  it("aceita números colados de listas com marcadores e quebras de linha", () => {
    expect(extrairNumerosEsicTexto("- 040/2026\n- 041/2026\n- 101/2026"))
      .toEqual(["0.040/2026", "0.041/2026", "0.101/2026"]);
  });
});