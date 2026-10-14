import { describe, expect, it } from "vitest";
import { parseProtocolAddressLines } from "./protocol-map-import.shared";

describe("parseProtocolAddressLines", () => {
  it("lê número — endereço e ignora linhas vazias", () => {
    expect(parseProtocolAddressLines("\n1949 — R. Júlio de Modesti - Poço Fundo\n")).toEqual({
      entries: [
        {
          line: 2,
          numero: "1949",
          endereco: "R. Júlio de Modesti - Poço Fundo",
        },
      ],
      issues: [],
    });
  });

  it("aceita hífen longo e hífen separador com espaços", () => {
    expect(parseProtocolAddressLines("1949 – Rua A\n1950 - Rua B").entries).toEqual([
      { line: 1, numero: "1949", endereco: "Rua A" },
      { line: 2, numero: "1950", endereco: "Rua B" },
    ]);
  });

  it("marca linhas malformadas e repetições do mesmo protocolo", () => {
    const result = parseProtocolAddressLines("1949 — Rua A\n1950 sem endereço\n1949 — Rua B");
    expect(result.entries).toEqual([]);
    expect(result.issues).toHaveLength(3);
    expect(result.issues.some((issue) => issue.message.includes("duplicidade"))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("formato"))).toBe(true);
  });
});
