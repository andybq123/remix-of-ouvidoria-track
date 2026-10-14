import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createRoot, type Root } from "react-dom/client";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import type { MapDepartment } from "@/lib/map-departments";
import { mapDepartmentOf } from "@/lib/map-departments";
import { obterIconeSecretaria, SECRETARIA_ICONES } from "@/lib/secretaria-map-icons";

export { SECRETARIA_ICONES };

// Color mapping by categoria (matches badge colors in src/lib/prazo.ts)
const CATEGORIA_COLORS: Record<string, { fill: string; label: string }> = {
  elogio:            { fill: "#16a34a", label: "Elogio" },              // green-600
  reclamacao:        { fill: "#dc2626", label: "Reclamação" },          // red-600
  pedido_informacao: { fill: "#9333ea", label: "Pedido de informação"}, // purple-600
  esic:              { fill: "#0f766e", label: "Pedido e-SIC" },
  denuncia:          { fill: "#000000", label: "Denúncia" },
  solicitacao:       { fill: "#facc15", label: "Solicitação" },         // yellow-400
  outros:            { fill: "#94a3b8", label: "Outros" },              // slate-400
};

function pinSvg(categoria?: string | null) {
  const c = CATEGORIA_COLORS[categoria ?? "outros"] ?? CATEGORIA_COLORS.outros;
  const stroke = c.fill === "#facc15" ? "#000" : "#fff";
  const text = c.fill === "#facc15" ? "#000" : "#fff";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
      <path d="M15 1 C7 1 1 7 1 15 C1 25 15 41 15 41 C15 41 29 25 29 15 C29 7 23 1 15 1 Z"
        fill="${c.fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="15" cy="15" r="5" fill="${text}" opacity="0.95"/>
    </svg>`;
}

function obrasPinSvg(icone?: string | null, badgeCount?: number) {
  const customIcon = obterIconeSecretaria(icone, "obras");
  const badge = badgeCount == null ? "" : badgeCount > 99 ? "99+" : String(badgeCount);
  const badgeSvg = badge
    ? `<div style="position:absolute;top:-4px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#0f172a;color:#fff;font:700 10px/18px ui-sans-serif,system-ui,sans-serif;text-align:center;border:2px solid #fff;box-sizing:border-box;">${badge}</div>`
    : "";
  const symbol = customIcon
    ? `<div style="position:absolute;top:5px;left:0;width:30px;height:24px;display:flex;align-items:center;justify-content:center;font-family:system-ui,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif;font-size:15px;line-height:1;">${customIcon.emoji}</div>`
    : `<img src="/icons/obras-marker.png" alt="" style="position:absolute;left:7px;top:6px;width:16px;height:16px;object-fit:contain;pointer-events:none;" />`;
  return `
    <div style="position:relative;width:30px;height:42px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42" style="position:absolute;inset:0;">
        <path d="M15 1 C7 1 1 7 1 15 C1 25 15 41 15 41 C15 41 29 25 29 15 C29 7 23 1 15 1 Z"
          fill="#b45309" stroke="#fff" stroke-width="2"/>
      </svg>
      ${symbol}${badgeSvg}
    </div>`;
}

function secretariaSvg(icone?: string | null) {
  const cfg = obterIconeSecretaria(icone);
  return `
    <div style="position:relative;width:36px;height:46px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46" style="position:absolute;inset:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
        <path d="M18 1 L33 1 Q35 1 35 3 L35 30 Q35 32 33 32 L24 32 L18 45 L12 32 L3 32 Q1 32 1 30 L1 3 Q1 1 3 1 Z"
          fill="#ffffff" stroke="#1d4ed8" stroke-width="2"/>
      </svg>
      <div style="position:absolute;top:3px;left:0;width:36px;height:28px;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">${cfg.emoji}</div>
    </div>`;
}

export type SecretariaPoint = {
  id: string;
  lat: number;
  lng: number;
  nome: string;
  sigla?: string | null;
  endereco?: string | null;
  icone?: string | null;
};

export type LocalPoint = {
  id: string;
  lat: number;
  lng: number;
  nome: string;
  secretaria?: string | null;
  secretariaIcone?: string | null;
  mapDepartment?: MapDepartment | null;
};

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  numero: string;
  numero_esic?: string | null;
  assunto?: string | null;
  endereco?: string | null;
  status?: string | null;
  atrasada?: boolean;
  secretaria?: string | null;
  secretariaIcone?: string | null;
  data_abertura?: string | null;
  data_conclusao?: string | null;
  categoria?: string | null;
  tipo?: string | null;
  local?: string | null;
  local_id?: string | null;
  mapDepartment?: MapDepartment | null;
};

function ProtocolMapPopup({ point, onOpen }: { point: MapPoint; onOpen?: (id: string) => void }) {
  return (
    <div className="space-y-1.5 min-w-[200px] max-w-[280px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-primary">{point.numero}</span>
        {point.atrasada && point.status !== "concluido" ? (
          <span className="text-[9px] uppercase tracking-wide rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.5 font-semibold">Atrasada</span>
        ) : point.status && <span className="text-[9px] uppercase tracking-wide rounded bg-muted px-1.5 py-0.5">{point.status.replace(/_/g, " ")}</span>}
      </div>
      {point.assunto && <p className="text-xs font-medium">{point.assunto}</p>}
      {point.endereco && <p className="text-xs text-muted-foreground">{point.endereco}</p>}
      {onOpen && (
        <button type="button" className="text-xs text-primary underline" onClick={() => onOpen(point.id)}>
          Abrir protocolo
        </button>
      )}
    </div>
  );
}

function formatLocalDate(s: string) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

// Brusque center [lng, lat]
const BRUSQUE: [number, number] = [-48.9114, -27.0978];

// Color by protocol load: green (light), yellow (attention), red (heavy)
function loadColor(count: number) {
  if (count >= 6) return { fill: "#dc2626", stroke: "#7f1d1d", label: "Alta demanda" };   // red-600
  if (count >= 3) return { fill: "#f59e0b", stroke: "#78350f", label: "Atenção" };        // amber-500
  return { fill: "#16a34a", stroke: "#14532d", label: "Tranquilo" };                       // green-600
}

// Health-unit marker: medical cross + count badge, colored by load
function localSvg(count: number, icone?: string | null) {
  const cfg = obterIconeSecretaria(icone, "saude");
  const c = loadColor(count);
  const badge = count > 99 ? "99+" : String(count);
  const badgeW = badge.length >= 3 ? 22 : badge.length === 2 ? 18 : 16;
  return `
    <div style="position:relative;width:40px;height:40px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" style="position:absolute;inset:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
        <circle cx="20" cy="20" r="17" fill="${c.fill}" stroke="#ffffff" stroke-width="3"/>

      </svg>
      <div style="position:absolute;left:0;top:7px;width:40px;text-align:center;font-family:system-ui,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif;font-size:21px;line-height:26px;">${cfg.emoji}</div>
      <div style="position:absolute;top:-4px;right:-6px;min-width:${badgeW}px;height:18px;padding:0 4px;border-radius:9px;background:#0f172a;color:#ffffff;font:700 11px/18px ui-sans-serif,system-ui,sans-serif;text-align:center;border:2px solid #ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.35);box-sizing:border-box;">${badge}</div>
    </div>`;
}

// Cluster marker for multiple health units at the same coordinates
function clusterSvg(unitCount: number, totalProtocolos: number, icone?: string | null) {
  const cfg = obterIconeSecretaria(icone, "saude");
  const c = loadColor(totalProtocolos);
  const badge = unitCount > 99 ? "99+" : String(unitCount);
  const badgeW = badge.length >= 3 ? 22 : badge.length === 2 ? 18 : 16;
  return `
    <div style="position:relative;width:44px;height:44px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" style="position:absolute;inset:0;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));">
        <rect x="6" y="10" width="32" height="28" rx="6" fill="#ffffff" stroke="${c.fill}" stroke-width="2.5" opacity="0.85"/>
        <rect x="3" y="6" width="32" height="28" rx="6" fill="${c.fill}" stroke="#ffffff" stroke-width="2.5"/>

      </svg>
      <div style="position:absolute;left:0;top:7px;width:40px;text-align:center;font-family:system-ui,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif;font-size:21px;line-height:26px;">${cfg.emoji}</div>
      <div style="position:absolute;top:-4px;right:-6px;min-width:${badgeW}px;height:18px;padding:0 4px;border-radius:9px;background:#0f172a;color:#ffffff;font:700 11px/18px ui-sans-serif,system-ui,sans-serif;text-align:center;border:2px solid #ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.35);box-sizing:border-box;">${badge}</div>
    </div>`;
}

// Interactive popup content for a single health unit (used by both single & cluster markers)
function UnitProtocolList({
  local,
  protocolos,
  onOpen,
  onBack,
}: {
  local: LocalPoint;
  protocolos: MapPoint[];
  onOpen?: (id: string) => void;
  onBack?: () => void;
}) {
  const count = protocolos.length;
  const load = loadColor(count);
  const stats = useMemo(() => {
    const concluidos = protocolos.filter(p => p.status === "concluido").length;
    const abertos = protocolos.length - concluidos;
    const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const now = new Date();
    // Últimos 3 meses (incluindo o corrente), do mais antigo para o mais recente
    const buckets = [2, 1, 0].map(offset => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: MESES[d.getMonth()],
        count: 0,
      };
    });
    protocolos.forEach(p => {
      if (!p.data_abertura) return;
      const ym = p.data_abertura.slice(0, 7);
      const b = buckets.find(x => x.key === ym);
      if (b) b.count++;
    });
    const ult3 = buckets.reduce((a, b) => a + b.count, 0);
    const media = ult3 / 3;
    const maxBar = Math.max(1, ...buckets.map(b => b.count));
    return { concluidos, abertos, ult3, media, buckets, maxBar };
  }, [protocolos]);
  return (
    <div className="space-y-2 min-w-[280px] max-w-[340px]">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] text-primary hover:underline"
        >
          ← Voltar à lista de unidades
        </button>
      )}
      <div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: load.fill }}
            aria-hidden
          >+</span>
          <span className="text-sm font-bold">{local.nome}</span>
        </div>
        {local.secretaria && <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{local.secretaria}</p>}
        <p className="text-xs mt-1">
          <strong>{count}</strong> protocolo(s) no total ·{" "}
          <span style={{ color: load.fill }} className="font-semibold">{load.label}</span>
        </p>
      </div>
      <div className="rounded border border-border bg-muted/40 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Volume — últimos 3 meses
          </span>
          <span className="text-[10px] text-muted-foreground">
            média <strong className="text-foreground">{stats.media.toFixed(1)}</strong>/mês
          </span>
        </div>
        {/* Mini gráfico de barras */}
        <div className="relative h-16">
          {/* linha da média */}
          <div
            className="absolute left-0 right-0 border-t border-dashed border-primary/60 z-10"
            style={{ bottom: `${(stats.media / stats.maxBar) * 100}%` }}
            title={`Média ${stats.media.toFixed(1)}/mês`}
          />
          <div className="absolute inset-0 flex items-end justify-around gap-2">
            {stats.buckets.map(b => {
              const h = (b.count / stats.maxBar) * 100;
              return (
                <div key={b.key} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-bold text-foreground leading-none">{b.count}</span>
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${Math.max(h, 2)}%`, minHeight: "2px" }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-end justify-around gap-2">
          {stats.buckets.map(b => (
            <span key={b.key} className="flex-1 text-center text-[10px] text-muted-foreground">
              {b.label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 pt-1 border-t border-border/60 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Últ. 3m</div>
            <div className="text-xs font-bold">{stats.ult3}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Abertos</div>
            <div className="text-xs font-bold text-amber-600">{stats.abertos}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Concluídos</div>
            <div className="text-xs font-bold text-green-600">{stats.concluidos}</div>
          </div>
        </div>
      </div>
      {protocolos.length > 0 && (
        <div className="max-h-[240px] overflow-y-auto -mx-1 pr-1 space-y-1">
          {protocolos.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen?.(p.id)}
              className="w-full text-left text-xs px-2 py-1.5 rounded border border-border hover:bg-muted/60 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-primary">{p.numero}</span>
                {p.status && (
                  <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted">
                    {p.status.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {p.numero_esic && <p className="font-mono text-[10px] text-teal-700 dark:text-teal-300">e-SIC {p.numero_esic}</p>}
              {p.assunto && <p className="mt-0.5 line-clamp-2 text-foreground">{p.assunto}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClusterPopup({
  locais,
  protocolosPorLocal,
  onOpen,
}: {
  locais: LocalPoint[];
  protocolosPorLocal: Map<string, MapPoint[]>;
  onOpen?: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const sel = locais.find(l => l.id === selected);
  if (sel) {
    return (
      <UnitProtocolList
        local={sel}
        protocolos={protocolosPorLocal.get(sel.id) ?? []}
        onOpen={onOpen}
        onBack={() => setSelected(null)}
      />
    );
  }
  const totalProtos = locais.reduce((acc, l) => acc + (protocolosPorLocal.get(l.id)?.length ?? 0), 0);
  return (
    <div className="space-y-2 min-w-[260px] max-w-[320px]">
      <div>
        <p className="text-sm font-bold">{locais.length} unidades neste endereço</p>
        <p className="text-[11px] text-muted-foreground">Total: {totalProtos} protocolo(s). Selecione uma unidade.</p>
      </div>
      <div className="max-h-[280px] overflow-y-auto -mx-1 pr-1 space-y-1">
        {locais.map(l => {
          const count = (protocolosPorLocal.get(l.id) ?? []).length;
          const load = loadColor(count);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelected(l.id)}
              className="w-full text-left text-xs px-2 py-2 rounded border border-border hover:bg-muted/60 transition flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: load.fill }}
                  aria-hidden
                >+</span>
                <span className="font-medium truncate">{l.nome}</span>
              </div>
              <span className="text-[10px] font-semibold shrink-0" style={{ color: load.fill }}>
                {count} prot.
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ManifestacoesMap({
  points,
  height = 400,
  className,
  onOpenProtocolo,
  secretarias = [],
  locais = [],
  onMoveLocal,
  onMoveSecretaria,
}: {
  points: MapPoint[];
  height?: number | string;
  className?: string;
  onOpenProtocolo?: (id: string) => void;
  secretarias?: SecretariaPoint[];
  locais?: LocalPoint[];
  onMoveLocal?: (id: string, lat: number, lng: number) => Promise<boolean> | boolean | void;
  onMoveSecretaria?: (id: string, lat: number, lng: number) => Promise<boolean> | boolean | void;
}) {
  const valid = useMemo(
    () => points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [points],
  );
  const validSecs = useMemo(
    () => secretarias.filter(s => typeof s.lat === "number" && typeof s.lng === "number"),
    [secretarias],
  );
  const validLocais = useMemo(
    () => locais.filter(l => typeof l.lat === "number" && typeof l.lng === "number"),
    [locais],
  );
  const validProtocolosObras = useMemo(
    () => valid.filter(p => p.mapDepartment === "obras"),
    [valid],
  );
  // Group health units that share the same (rounded) coordinates so they become a cluster
  const localGroups = useMemo(() => {
    const map = new Map<string, LocalPoint[]>();
    validLocais.forEach(l => {
      const department = l.mapDepartment ?? mapDepartmentOf({ nome: l.secretaria });
      const icon = obterIconeSecretaria(l.secretariaIcone, department);
      const key = `${l.lat.toFixed(5)},${l.lng.toFixed(5)},${department},${icon.key}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    });
    return Array.from(map.values());
  }, [validLocais]);
  const protocolosPorLocal = useMemo(() => {
    const map = new Map<string, MapPoint[]>();
    points.forEach(p => {
      if (!p.local_id) return;
      const arr = map.get(p.local_id) ?? [];
      arr.push(p);
      map.set(p.local_id, arr);
    });
    return map;
  }, [points]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const rootsRef = useRef<Root[]>([]);
  const onOpenRef = useRef(onOpenProtocolo);
  useEffect(() => { onOpenRef.current = onOpenProtocolo; }, [onOpenProtocolo]);
  const onMoveLocalRef = useRef(onMoveLocal);
  useEffect(() => { onMoveLocalRef.current = onMoveLocal; }, [onMoveLocal]);
  const onMoveSecRef = useRef(onMoveSecretaria);
  useEffect(() => { onMoveSecRef.current = onMoveSecretaria; }, [onMoveSecretaria]);

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: BRUSQUE,
      zoom: 13,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    mapRef.current = map;
    return () => {
      const roots = rootsRef.current;
      const markers = markersRef.current;
      rootsRef.current = [];
      markersRef.current = [];
      mapRef.current = null;
      // Defer unmount to avoid "synchronously unmount a root while React was already rendering"
      queueMicrotask(() => {
        roots.forEach(r => { try { r.unmount(); } catch { /* noop */ } });
        markers.forEach(m => m.remove());
        try { map.remove(); } catch { /* noop */ }
      });
    };
  }, []);

  // update markers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // cleanup existing
      const oldRoots = rootsRef.current;
      const oldMarkers = markersRef.current;
      rootsRef.current = [];
      markersRef.current = [];
      queueMicrotask(() => {
        oldRoots.forEach(r => { try { r.unmount(); } catch { /* noop */ } });
        oldMarkers.forEach(m => m.remove());
      });

      // secretarias
      validSecs.forEach(s => {
        const cfg = obterIconeSecretaria(s.icone, mapDepartmentOf(s));
        const el = document.createElement("div");
        el.innerHTML = secretariaSvg(cfg.key);
        el.style.cursor = onMoveSecRef.current ? "grab" : "pointer";
        el.setAttribute("aria-label", `Secretaria ${s.nome} · ${cfg.label}`);
        el.title = onMoveSecRef.current ? "Arraste para reposicionar" : s.nome;
        const popupNode = document.createElement("div");
        const root = createRoot(popupNode);
        root.render(
          <div className="space-y-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{cfg.emoji}</span>
              <span className="text-sm font-bold">{s.nome}</span>
              {s.sigla && <span className="text-xs text-muted-foreground">({s.sigla})</span>}
            </div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Secretaria · {cfg.label}</p>
            {s.endereco && <p className="text-xs">{s.endereco}</p>}
          </div>,
        );
        rootsRef.current.push(root);
        const popup = new mapboxgl.Popup({ offset: 28, maxWidth: "300px" }).setDOMContent(popupNode);
        const draggableSec = !!onMoveSecRef.current;
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: draggableSec })
          .setLngLat([s.lng, s.lat])
          .setPopup(popup)
          .addTo(map);
        if (draggableSec) {
          const origin: [number, number] = [s.lng, s.lat];
          marker.on("dragstart", () => { el.style.cursor = "grabbing"; });
          marker.on("dragend", async () => {
            el.style.cursor = "grab";
            const ll = marker.getLngLat();
            const ok = await onMoveSecRef.current?.(s.id, ll.lat, ll.lng);
            if (ok === false) marker.setLngLat(origin);
          });
        }
        markersRef.current.push(marker);
      });

      // locais (UBS / pontos de atendimento) — render single OR cluster marker
      localGroups.forEach(group => {
        // CLUSTER: multiple unidades sharing the same coordinate
        if (group.length > 1) {
          const totalProtos = group.reduce((acc, l) => acc + (protocolosPorLocal.get(l.id)?.length ?? 0), 0);
          const worksIcon = (group[0].mapDepartment ?? mapDepartmentOf({ nome: group[0].secretaria })) === "obras";
          const el = document.createElement("div");
          el.innerHTML = worksIcon
            ? obrasPinSvg(group[0].secretariaIcone, group.length)
            : clusterSvg(group.length, totalProtos, group[0].secretariaIcone);
          el.setAttribute("aria-label", `Grupo de ${group.length} locais · ${obterIconeSecretaria(group[0].secretariaIcone, group[0].mapDepartment ?? mapDepartmentOf({ nome: group[0].secretaria })).label}`);
          el.style.cursor = "pointer";
          const popupNode = document.createElement("div");
          const root = createRoot(popupNode);
          root.render(
            <ClusterPopup
              locais={group}
              protocolosPorLocal={protocolosPorLocal}
              onOpen={(id) => onOpenRef.current?.(id)}
            />,
          );
          rootsRef.current.push(root);
          const popup = new mapboxgl.Popup({ offset: 24, maxWidth: "340px" }).setDOMContent(popupNode);
          const marker = new mapboxgl.Marker({ element: el, anchor: worksIcon ? "bottom" : "center" })
            .setLngLat([group[0].lng, group[0].lat])
            .setPopup(popup)
            .addTo(map);
          markersRef.current.push(marker);
          return;
        }
        // SINGLE
        const l = group[0];
        const lista = protocolosPorLocal.get(l.id) ?? [];
        const count = lista.length;
        const isWorksLocal = (l.mapDepartment ?? mapDepartmentOf({ nome: l.secretaria })) === "obras";
        const el = document.createElement("div");
        el.innerHTML = isWorksLocal ? obrasPinSvg(l.secretariaIcone, count) : localSvg(count, l.secretariaIcone);
        el.style.cursor = onMoveLocalRef.current ? "grab" : "pointer";
        el.setAttribute("aria-label", `Local ${l.nome} · ${obterIconeSecretaria(l.secretariaIcone, l.mapDepartment ?? mapDepartmentOf({ nome: l.secretaria })).label}`);
        el.title = onMoveLocalRef.current ? "Arraste para reposicionar" : l.nome;
        const popupNode = document.createElement("div");
        const root = createRoot(popupNode);
        root.render(
          <UnitProtocolList local={l} protocolos={lista} onOpen={(id) => onOpenRef.current?.(id)} />,
        );
        rootsRef.current.push(root);
        const popup = new mapboxgl.Popup({ offset: 22, maxWidth: "340px" }).setDOMContent(popupNode);
        const draggableLocal = !!onMoveLocalRef.current;
        const marker = new mapboxgl.Marker({ element: el, anchor: isWorksLocal ? "bottom" : "center", draggable: draggableLocal })
          .setLngLat([l.lng, l.lat])
          .setPopup(popup)
          .addTo(map);
        if (draggableLocal) {
          const origin: [number, number] = [l.lng, l.lat];
          marker.on("dragstart", () => { el.style.cursor = "grabbing"; });
          marker.on("dragend", async () => {
            el.style.cursor = "grab";
            const ll = marker.getLngLat();
            const ok = await onMoveLocalRef.current?.(l.id, ll.lat, ll.lng);
            if (ok === false) marker.setLngLat(origin);
          });
        }
        markersRef.current.push(marker);
      });

      // Cada protocolo de Obras com coordenadas ganha um marcador próprio e identificável.
      validProtocolosObras.forEach((point) => {
        const el = document.createElement("div");
        el.innerHTML = obrasPinSvg(point.secretariaIcone);
        el.style.cursor = "pointer";
        el.setAttribute("aria-label", `Obras · protocolo ${point.numero}`);
        const popupNode = document.createElement("div");
        const root = createRoot(popupNode);
        root.render(<ProtocolMapPopup point={point} onOpen={(id) => onOpenRef.current?.(id)} />);
        rootsRef.current.push(root);
        const popup = new mapboxgl.Popup({ offset: 30, maxWidth: "300px" }).setDOMContent(popupNode);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([point.lng, point.lat])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
      });

      // fit bounds
      const all = [...validSecs, ...validLocais, ...validProtocolosObras];
      if (all.length === 1) {
        map.flyTo({ center: [all[0].lng, all[0].lat], zoom: 15, duration: 0 });
      } else if (all.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        all.forEach(p => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [valid, validSecs, validLocais, validProtocolosObras, localGroups, protocolosPorLocal]);

  return (
    <div
      className={className}
      style={{
        height,
        width: "100%",
        isolation: "isolate",
        position: "relative",
        zIndex: 0,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{ height: "100%", width: "100%", borderRadius: 8, overflow: "hidden", contain: "paint" }}
      />
      {!validSecs.length && !validLocais.length && !validProtocolosObras.length && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Nenhuma unidade cadastrada com coordenadas ainda.
        </p>
      )}
    </div>
  );
}
