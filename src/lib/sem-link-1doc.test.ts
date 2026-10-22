import { describe, expect, it } from "vitest";
import {
  deveConstarSemLink1doc,
  semLinkDeOutroSistema,
  valorDoNumero,
} from "./sem-link-1doc";

describe("lista de ouvidorias sem link 1doc", () => {
  it("esconde ouvidorias de outro sistema (/2025)", () => {
    expect(deveConstarSemLink1doc("3.565/2025")).toBe(false);
    expect(deveConstarSemLink1doc("12/2025")).toBe(false);
  });
  it("esconde ouvidorias abaixo de 500/2026, que são de outro sistema", () => {
    expect(deveConstarSemLink1doc("12/2026")).toBe(false);
    expect(deveConstarSemLink1doc("499/2026")).toBe(false);
  });
  it("mantém ouvidorias do 1Doc atual", () => {
    expect(deveConstarSemLink1doc("500/2026")).toBe(true);
    expect(deveConstarSemLink1doc("3.565/2026")).toBe(true);
    expect(deveConstarSemLink1doc("9.001/2026")).toBe(true);
    expect(deveConstarSemLink1doc(null)).toBe(true);
  });
  it("não aplica limite a ano sem regra própria", () => {
    expect(deveConstarSemLink1doc("12/2027")).toBe(true);
  });
  it("lê o número ignorando separadores de milhar", () => {
    expect(valorDoNumero("3.565/2026")).toBe(3565);
    expect(valorDoNumero("12/2026")).toBe(12);
    expect(valorDoNumero("sem numero/2026")).toBeNull();
  });
  it("filtra os anos de outro sistema na consulta ao banco", () => {
    const filtros: string[] = [];
    const query = {
      not(column: string, operator: string, value: string) {
        filtros.push(`${column} ${operator} ${value}`);
        return query;
      },
    };
    semLinkDeOutroSistema(query);
    expect(filtros).toEqual(["numero like %/2025%"]);
  });
});
