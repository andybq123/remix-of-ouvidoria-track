import { describe, expect, it } from "vitest";
import {
  buildProtocolNumberOrFilter,
  parseProtocolAddressLines,
  protocolNumberMatches,
} from "./protocol-map-import.shared";

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

describe("protocol number lookup", () => {
  it("matches short, dotted and year-suffixed protocol numbers", () => {
    expect(protocolNumberMatches("2798", "2.798/2026")).toBe(true);
    expect(protocolNumberMatches("2.798/2026", "2798/2026")).toBe(true);
    expect(protocolNumberMatches("2798/2026", "2.798/2025")).toBe(false);
  });

  it("searches both unformatted and Brazilian thousands-separated numbers", () => {
    expect(buildProtocolNumberOrFilter("2798")).toContain("numero.like.2.798/%");
    expect(buildProtocolNumberOrFilter("2798")).toContain("numero.eq.2798");
    expect(buildProtocolNumberOrFilter("2.798/2026")).toContain("numero.eq.2.798/2026");
    expect(buildProtocolNumberOrFilter("not-a-number")).toBe(
      "numero.eq.__invalid_protocol_number__",
    );
  });

  it("rejects address lines without a numeric protocol identifier", () => {
    const result = parseProtocolAddressLines("ABC — Rua do exemplo, Centro");
    expect(result.entries).toEqual([]);
    expect(result.issues[0].message).toContain("ao menos um dígito");
  });
});
