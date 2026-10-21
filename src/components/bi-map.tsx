import { useEffect, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

export type BiMapPoint = {
  id: string;
  nome: string;
  lat: number;
  lng: number;
  total: number;
  cor: string;
  extra?: string;
  destaque?: boolean;
};

const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";
const BRUSQUE: [number, number] = [-48.9126, -27.098];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Mapa escuro do painel de BI: círculos proporcionais ao volume de manifestações. */
export function BiMap({ points, height = 420 }: { points: BiMapPoint[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointsKey = JSON.stringify(points);

  useEffect(() => {
    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    const markers: import("mapbox-gl").Marker[] = [];

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: DARK_STYLE,
        center: BRUSQUE,
        zoom: 11.5,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

      const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      const max = Math.max(1, ...valid.map((p) => p.total));
      for (const p of valid) {
        const size = Math.round(16 + 30 * Math.sqrt(p.total / max));
        const el = document.createElement("div");
        el.style.cssText = [
          `width:${size}px`,
          `height:${size}px`,
          "border-radius:50%",
          `background:${p.cor}`,
          "opacity:0.85",
          "border:2px solid rgba(255,255,255,0.85)",
          `box-shadow:0 0 14px ${p.cor}`,
          "cursor:pointer",
          p.destaque ? "outline:3px solid var(--brusque-red, #dc2626);outline-offset:3px" : "",
        ].join(";");
        el.title = `${p.nome}: ${p.total}`;
        const popup = new mapboxgl.Popup({ offset: size / 2 + 6, closeButton: false }).setHTML(
          `<div style="font:12px system-ui"><strong>${escapeHtml(p.nome)}</strong><br/>${p.total} manifestações${
            p.extra ? `<br/>${escapeHtml(p.extra)}` : ""
          }</div>`,
        );
        markers.push(
          new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map),
        );
      }
      if (valid.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        valid.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      }
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full overflow-hidden rounded-md border border-border"
    />
  );
}
