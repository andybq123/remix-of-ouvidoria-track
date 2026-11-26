import { describe, expect, it } from "vitest";
import {
  TAMANHO_MASCOTE,
  clampPosicao,
  deserializarPosicao,
  posicaoPadrao,
  serializarPosicao,
} from "./ouvidorizinho-posicao";

describe("posição do widget Ouvidorzinho", () => {
  it("posição padrão fica no canto inferior direito", () => {
    const p = posicaoPadrao(1280, 800);
    expect(p.x).toBe(1280 - TAMANHO_MASCOTE - 24);
    expect(p.y).toBe(800 - TAMANHO_MASCOTE - 24);
  });

  it("clamp mantém o botão dentro da viewport", () => {
    expect(clampPosicao({ x: -50, y: -10 }, 1280, 800)).toEqual({ x: 12, y: 12 });
    expect(clampPosicao({ x: 5000, y: 5000 }, 1280, 800)).toEqual({
      x: 1280 - TAMANHO_MASCOTE - 12,
      y: 800 - TAMANHO_MASCOTE - 12,
    });
    expect(clampPosicao({ x: 100, y: 100 }, 1280, 800)).toEqual({ x: 100, y: 100 });
  });

  it("serialização e leitura fazem round-trip", () => {
    const pos = { x: 123, y: 456 };
    expect(deserializarPosicao(serializarPosicao(pos))).toEqual(pos);
  });

  it("valores guardados inválidos voltam null (usa o padrão)", () => {
    expect(deserializarPosicao(null)).toBeNull();
    expect(deserializarPosicao("")).toBeNull();
    expect(deserializarPosicao("não-json")).toBeNull();
    expect(deserializarPosicao('{"x":"a","y":10}')).toBeNull();
    expect(deserializarPosicao('{"x":10}')).toBeNull();
    expect(deserializarPosicao("[1,2]")).toBeNull();
  });
});
