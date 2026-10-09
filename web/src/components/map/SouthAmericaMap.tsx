"use client";

import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { geoBounds } from "d3-geo";
import { useEffect, useRef } from "react";
import { feature as topoFeature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry, LineString } from "geojson";
import { hexToRgba, type FlowProps } from "./flows";
import { MAP_PALETTE, type MapPalette } from "./scales";
import { ACTOR_ANCHOR } from "@/lib/constants";
import type { Theme } from "@/lib/theme";
import type { CountryMeta } from "@/lib/types";

export interface CountryFeatureProps {
  iso3: string;
  name: string;
  sovereign: string;
  in_scope: boolean;
  status: string;
  fill?: string;
  value?: number | null;
}

type FC = FeatureCollection<Geometry, CountryFeatureProps>;
type FlowFC = FeatureCollection<LineString, FlowProps>;
export type FitTarget = { kind: "home" } | { kind: "countries"; isos: string[] } | { kind: "bounds"; bounds: [[number, number], [number, number]] };
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const CONTINENT_BOUNDS: [[number, number], [number, number]] = [[-84, -57], [-33, 14]];
const EMPTY_FLOWS: FlowFC = { type: "FeatureCollection", features: [] };
/** Label anchors that differ from the data centroid, to avoid collisions in the Guianas. */
const LABEL_POS: Record<string, [number, number]> = { GUY: [-59.4, 5.9], SUR: [-55.9, 3.9], GUF: [-53.2, 2.3] };
const WIDE_ZOOM = 2.2; // below this the country labels are hidden (world view)

interface Props {
  /** fill colour per iso3 for in-scope countries; missing => no data */
  fills: Record<string, string | undefined>;
  values: Record<string, number | null>;
  countries: CountryMeta[];
  /** selected countries (one, or several in compare mode) */
  selection: string[];
  onSelect: (iso3: string | null, additive?: boolean) => void;
  onHover?: (iso3: string | null) => void;
  describeValue: (iso3: string, v: number | null) => string;
  /** colour scheme in effect; the canvas cannot read CSS variables, so the palette is painted from here */
  theme?: Theme;
  /** arcs to draw (money or trade flows); null hides the layer and the anchor badges */
  flows?: FlowFC | null;
  /** light world basemap (topojson) drawn under the continent in the flow views */
  worldUrl?: string;
  /** where the camera should be; a change moves it */
  fitTo?: FitTarget | null;
  fitPadding?: Padding;
  /** a travelling pulse along the arcs (off under prefers-reduced-motion) */
  animateFlows?: boolean;
  /** country to show as hovered (from the ranking or compare lists) */
  highlight?: string | null;
}

export function SouthAmericaMap({ fills, values, countries, selection, onSelect, onHover, describeValue, theme = "light", flows = null, worldUrl, fitTo = null, fitPadding, animateFlows = true, highlight = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dataRef = useRef<FC | null>(null);
  const hoverRef = useRef<string | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const anchorsRef = useRef<HTMLDivElement[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const callbacks = useRef({ onSelect, onHover, describeValue, values, fills });
  callbacks.current = { onSelect, onHover, describeValue, values, fills };
  const paletteRef = useRef<MapPalette>(MAP_PALETTE[theme]);
  paletteRef.current = MAP_PALETTE[theme];
  const flowsRef = useRef<FlowFC | null>(flows);
  flowsRef.current = flows;
  const fitRef = useRef<{ target: FitTarget | null; padding: Padding | undefined }>({ target: fitTo, padding: fitPadding });
  fitRef.current = { target: fitTo, padding: fitPadding };
  const loadedRef = useRef(false);
  const hasFlows = !!flows && flows.features.length > 0;
  const fitKey = JSON.stringify(fitTo) + JSON.stringify(fitPadding ?? null);

  // Initialise the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    // MapLibre 6 loads its worker as a separate ES module; serve it from /vendor (copied at build time).
    maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": paletteRef.current.sea } }],
      },
      bounds: CONTINENT_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
      boxZoom: false, // shift-click adds a country to the comparison instead
      minZoom: 0,
      maxZoom: 7,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Boundaries: Natural Earth (public domain)" }), "bottom-right");
    map.getCanvas().setAttribute("aria-label", "Map of South America; countries are coloured by the selected indicator and arcs show money or trade flows. Use the country list for keyboard access.");
    map.getCanvas().setAttribute("role", "img");
    mapRef.current = map;
    (container as HTMLDivElement & { __map?: MLMap }).__map = map; // for browser tests
    const onZoom = () => container.classList.toggle("map-wide", map.getZoom() < WIDE_ZOOM);
    map.on("zoom", onZoom);

    map.on("load", async () => {
      const [topo, world] = await Promise.all([
        fetch("/data/south-america.topo.json").then((r) => r.json() as Promise<Topology>),
        worldUrl ? fetch(worldUrl).then((r) => r.json() as Promise<Topology>).catch(() => null) : Promise.resolve(null),
      ]);
      const pal = paletteRef.current;
      if (world) {
        const wname = Object.keys(world.objects)[0];
        const wfc = topoFeature(world, world.objects[wname] as GeometryCollection) as unknown as FeatureCollection;
        map.addSource("world", { type: "geojson", data: wfc });
        map.addLayer({ id: "world-fill", type: "fill", source: "world", paint: { "fill-color": pal.outScope } });
        map.addLayer({ id: "world-line", type: "line", source: "world", paint: { "line-color": pal.outScopeLine, "line-width": 0.5, "line-opacity": 0.7 } });
      }
      const objName = Object.keys(topo.objects)[0];
      const fc = topoFeature(topo, topo.objects[objName] as GeometryCollection<CountryFeatureProps>) as unknown as FC;
      dataRef.current = fc;
      applyFills(fc, callbacks.current.values, callbacks.current.fills, pal);
      map.addSource("countries", { type: "geojson", data: fc, promoteId: "iso3" });
      map.addLayer({
        id: "countries-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": ["coalesce", ["get", "fill"], pal.noData],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.85, 1],
        },
      });
      map.addLayer({
        id: "countries-line",
        type: "line",
        source: "countries",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], pal.selected, pal.line],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, ["boolean", ["feature-state", "hover"], false], 2, 1],
        },
      });
      map.addLayer({
        id: "countries-outscope-line",
        type: "line",
        source: "countries",
        filter: ["==", ["get", "in_scope"], false],
        paint: { "line-color": pal.outScopeLine, "line-width": 1, "line-dasharray": [2, 2] },
      });
      // flows: two gradient layers (one per actor) plus an invisible wide layer for hovering thin arcs
      map.addSource("flows", { type: "geojson", data: flowsRef.current ?? EMPTY_FLOWS, lineMetrics: true });
      for (const actor of ["US", "CN"] as const) {
        map.addLayer({
          id: `flows-${actor.toLowerCase()}`,
          type: "line",
          source: "flows",
          filter: ["==", ["get", "actor"], actor],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": ["get", "width"],
            "line-opacity": ["case", ["get", "dim"], 0.18, 0.92],
            "line-gradient": gradient(actor === "US" ? pal.us : pal.cn, null),
          },
        });
      }
      map.addLayer({ id: "flows-hit", type: "line", source: "flows", paint: { "line-width": 16, "line-opacity": 0 } });
      // The scheme may have changed while the boundaries were loading.
      if (paletteRef.current !== pal) paintTheme(map, paletteRef.current);

      // Labels as HTML markers (no glyph server needed).
      for (const c of countries) {
        const el = document.createElement("div");
        el.className = `country-label${c.in_scope ? "" : " out-of-scope"}`;
        el.textContent = c.iso3 === "FLK" ? "Falklands / Malvinas" : c.iso3 === "GUF" ? "Fr. Guiana" : c.name;
        const pos = LABEL_POS[c.iso3] ?? [c.lon, c.lat];
        const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(pos).addTo(map);
        markersRef.current.push(m);
      }
      // Anchor badges where the arcs end (Washington, Beijing on the neighbouring world copy); positioned by hand on
      // every move because MapLibre markers re-wrap themselves to the nearest copy. Shown only with flows.
      for (const actor of ["US", "CN"] as const) {
        const el = document.createElement("div");
        el.className = `anchor-badge anchor-${actor.toLowerCase()}`;
        el.textContent = actor;
        el.title = actor === "US" ? "United States (Washington, schematic anchor)" : "China (Beijing, schematic anchor)";
        el.style.display = flowsRef.current && flowsRef.current.features.length ? "" : "none";
        anchorsRef.current.push(el);
        container.appendChild(el);
      }
      const placeAnchors = () => {
        anchorsRef.current.forEach((el, i) => {
          const [lon, lat] = ACTOR_ANCHOR[i === 0 ? "US" : "CN"];
          const pt = map.project([i === 0 ? lon : lon - 360, lat]);
          el.style.transform = `translate(${Math.round(pt.x - 16)}px, ${Math.round(pt.y - 16)}px)`;
        });
      };
      placeAnchors();
      map.on("move", placeAnchors);

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, maxWidth: "300px" });
      popupRef.current = popup;

      const setHover = (iso: string | null) => {
        if (hoverRef.current && hoverRef.current !== iso) map.setFeatureState({ source: "countries", id: hoverRef.current }, { hover: false });
        if (iso) map.setFeatureState({ source: "countries", id: iso }, { hover: true });
        hoverRef.current = iso;
        callbacks.current.onHover?.(iso);
      };
      const additive = (e: MapMouseEvent) => e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey;

      map.on("mousemove", "countries-fill", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        if (map.queryRenderedFeatures(e.point, { layers: ["flows-hit"] }).length) return; // an arc is under the pointer
        const p = f.properties as unknown as CountryFeatureProps;
        map.getCanvas().style.cursor = p.in_scope ? "pointer" : "default";
        setHover(p.iso3);
        const v = callbacks.current.values[p.iso3] ?? null;
        const text = p.in_scope ? callbacks.current.describeValue(p.iso3, v) : p.status === "french_territory" ? "French territory, outside the analysis" : "Disputed territory, outside the analysis";
        popup.setLngLat(e.lngLat).setHTML(`<div style="font: 12px/1.4 var(--font-sans); color: var(--ink)"><strong>${p.name}</strong><br/>${text}</div>`).addTo(map);
      });
      map.on("mouseleave", "countries-fill", () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
        popup.remove();
      });
      map.on("click", "countries-fill", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        if (map.queryRenderedFeatures(e.point, { layers: ["flows-hit"] }).length) return;
        const p = f.properties as unknown as CountryFeatureProps;
        if (p.in_scope) callbacks.current.onSelect(p.iso3, additive(e));
      });
      map.on("mousemove", "flows-hit", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as unknown as FlowProps;
        map.getCanvas().style.cursor = "pointer";
        setHover(p.iso3);
        popup.setLngLat(e.lngLat).setHTML(`<div style="font: 12px/1.4 var(--font-sans); color: var(--ink)"><strong>${p.title}</strong><br/>${p.detail}</div>`).addTo(map);
      });
      map.on("mouseleave", "flows-hit", () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
        popup.remove();
      });
      map.on("click", "flows-hit", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        callbacks.current.onSelect((f.properties as unknown as FlowProps).iso3, additive(e));
      });

      loadedRef.current = true;
      onZoom();
      if (fitRef.current.target) fit(map, fitRef.current.target, fitRef.current.padding, fc, 0);
    });

    return () => {
      map.off("zoom", onZoom);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      anchorsRef.current.forEach((el) => el.remove());
      anchorsRef.current = [];
      map.remove();
      mapRef.current = null;
      dataRef.current = null;
      loadedRef.current = false;
    };
    // countries list and the world file are static for the app's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update fills when the indicator changes.
  useEffect(() => {
    const map = mapRef.current;
    const fc = dataRef.current;
    if (!map || !fc) return;
    applyFills(fc, values, fills, paletteRef.current);
    (map.getSource("countries") as GeoJSONSource | undefined)?.setData(fc);
  }, [fills, values]);

  // Replace the arcs and show or hide the anchor badges.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("flows") as GeoJSONSource | undefined)?.setData(flows ?? EMPTY_FLOWS);
    for (const el of anchorsRef.current) el.style.display = hasFlows ? "" : "none";
  }, [flows, hasFlows]);

  // Repaint the sea, outlines, neutral fills and arc hues when the colour scheme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("countries-fill")) return;
    paintTheme(map, MAP_PALETTE[theme]);
    const fc = dataRef.current;
    if (fc) {
      applyFills(fc, callbacks.current.values, callbacks.current.fills, MAP_PALETTE[theme]);
      (map.getSource("countries") as GeoJSONSource | undefined)?.setData(fc);
    }
  }, [theme]);

  // Selection outlines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("countries")) return;
    for (const c of countries) map.setFeatureState({ source: "countries", id: c.iso3 }, { selected: selection.includes(c.iso3) });
  }, [selection, countries, fills]);

  // Hover from outside the map (ranking rows, compare chips).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("countries")) return;
    if (hoverRef.current && hoverRef.current !== highlight) map.setFeatureState({ source: "countries", id: hoverRef.current }, { hover: false });
    if (highlight) map.setFeatureState({ source: "countries", id: highlight }, { hover: true });
    hoverRef.current = highlight ?? null;
  }, [highlight]);

  // Camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !fitTo) return;
    fit(map, fitTo, fitPadding, dataRef.current, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // A pulse travelling along the arcs, 15 frames a second; static gradient otherwise.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pal = MAP_PALETTE[theme];
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const paint = (p: number | null) => {
      if (!map.getLayer("flows-us")) return;
      map.setPaintProperty("flows-us", "line-gradient", gradient(pal.us, p), { validate: false });
      map.setPaintProperty("flows-cn", "line-gradient", gradient(pal.cn, p), { validate: false });
    };
    if (!animateFlows || !hasFlows || reduce) {
      paint(null);
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 66) {
        last = t;
        paint((t / 2800) % 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      paint(null);
    };
  }, [animateFlows, hasFlows, theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Faint at the origin, full hue at the destination; with `p` a brighter pulse travels along the line. */
function gradient(hex: string, p: number | null): ExpressionSpecification {
  const faint = hexToRgba(hex, 0.3);
  const mid = hexToRgba(hex, 0.6);
  const full = hexToRgba(hex, 1);
  const stops: [number, string][] = [[0, faint]];
  if (p !== null) {
    for (const [pos, col] of [[p - 0.14, mid], [p, full], [p + 0.05, mid]] as [number, string][]) {
      if (pos > stops[stops.length - 1][0] + 0.002 && pos < 0.998) stops.push([pos, col]);
    }
  }
  stops.push([1, full]);
  return ["interpolate", ["linear"], ["line-progress"], ...stops.flat()] as unknown as ExpressionSpecification;
}

function paintTheme(map: MLMap, pal: MapPalette) {
  map.setPaintProperty("bg", "background-color", pal.sea);
  map.setPaintProperty("countries-fill", "fill-color", ["coalesce", ["get", "fill"], pal.noData]);
  map.setPaintProperty("countries-line", "line-color", ["case", ["boolean", ["feature-state", "selected"], false], pal.selected, pal.line]);
  map.setPaintProperty("countries-outscope-line", "line-color", pal.outScopeLine);
  if (map.getLayer("world-fill")) {
    map.setPaintProperty("world-fill", "fill-color", pal.outScope);
    map.setPaintProperty("world-line", "line-color", pal.outScopeLine);
  }
  if (map.getLayer("flows-us")) {
    map.setPaintProperty("flows-us", "line-gradient", gradient(pal.us, null));
    map.setPaintProperty("flows-cn", "line-gradient", gradient(pal.cn, null));
  }
}

/** Padding that leaves at least 160 px of canvas in each direction, so fitBounds never silently gives up. */
function clampPadding(map: MLMap, p: Padding | undefined): Padding {
  const base = p ?? { top: 24, right: 24, bottom: 24, left: 24 };
  const c = map.getContainer();
  const w = c.clientWidth || 800;
  const h = c.clientHeight || 600;
  const sx = Math.min(1, Math.max(0, w - 160) / Math.max(1, base.left + base.right));
  const sy = Math.min(1, Math.max(0, h - 160) / Math.max(1, base.top + base.bottom));
  return { top: Math.round(base.top * sy), bottom: Math.round(base.bottom * sy), left: Math.round(base.left * sx), right: Math.round(base.right * sx) };
}

function fit(map: MLMap, target: FitTarget, padding: Padding | undefined, fc: FC | null, duration: number) {
  const pad = clampPadding(map, padding);
  if (target.kind === "home") {
    map.fitBounds(CONTINENT_BOUNDS, { padding: pad, duration, maxZoom: 7 });
  } else if (target.kind === "bounds") {
    map.fitBounds(target.bounds, { padding: pad, duration });
  } else {
    if (!fc) return;
    const feats = fc.features.filter((f) => target.isos.includes(f.properties.iso3));
    if (feats.length === 0) return;
    const [[a, b], [c, d]] = geoBounds({ type: "FeatureCollection", features: feats });
    map.fitBounds([[a, b], [c, d]], { padding: pad, duration, maxZoom: target.isos.length === 1 ? 5 : 4.5 });
  }
}

function applyFills(fc: FC, vals: Record<string, number | null>, fills: Record<string, string | undefined>, pal: MapPalette) {
  for (const f of fc.features) {
    const p = f.properties;
    if (!p.in_scope) {
      p.fill = pal.outScope;
      p.value = null;
      continue;
    }
    const v = vals[p.iso3];
    p.value = v ?? null;
    p.fill = v === null || v === undefined ? pal.noData : fills[p.iso3] ?? pal.noData;
  }
}
