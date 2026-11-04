type ReadyMap = {
  isStyleLoaded: () => boolean;
  on: (event: "load" | "render", listener: () => void) => unknown;
  off: (event: "load" | "render", listener: () => void) => unknown;
};

/** Cancel outdated data updates and also handle style reloads after the initial load. */
export function atualizarMapaQuandoPronto(map: ReadyMap, apply: () => void): () => void {
  let active = true;
  const detach = () => {
    map.off("load", ready);
    map.off("render", ready);
  };
  const ready = () => {
    if (!active || !map.isStyleLoaded()) return;
    active = false;
    detach();
    apply();
  };
  map.on("load", ready);
  map.on("render", ready);
  ready();
  return () => {
    active = false;
    detach();
  };
}