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