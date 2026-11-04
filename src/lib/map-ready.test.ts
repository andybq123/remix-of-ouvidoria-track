import { describe, expect, it, vi } from "vitest";
import { atualizarMapaQuandoPronto } from "./map-ready";

function mapa() {
  let loaded = false;
  const listeners = new Map<string, Set<() => void>>();
  return {
    isStyleLoaded: () => loaded,
    on(event: string, listener: () => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event: string, listener: () => void) { listeners.get(event)?.delete(listener); },
    ready(event: string) { loaded = true; [...(listeners.get(event) ?? [])].forEach(fn => fn()); },
  };
}

describe("atualização do mapa", () => {
  it("trocar de Saúde para Obras durante o carregamento cancela os ícones antigos", () => {
    const map = mapa();
    const saude = vi.fn();
    const obras = vi.fn();
    const cancel = atualizarMapaQuandoPronto(map, saude);
    cancel();
    atualizarMapaQuandoPronto(map, obras);
    map.ready("load");
    map.ready("render");
    expect(saude).not.toHaveBeenCalled();
    expect(obras).toHaveBeenCalledTimes(1);
  });
  it("atualiza contagens no próximo render sem depender de um novo load", () => {
    const map = mapa();
    const apply = vi.fn();
    atualizarMapaQuandoPronto(map, apply);
    map.ready("render");
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it("aplica imediatamente quando o estilo já está pronto", () => {
    const map = mapa();
    map.ready("load");
    const apply = vi.fn();
    atualizarMapaQuandoPronto(map, apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});