"use client";

import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, MapMouseEvent, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { feature as topoFeature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { MAP_PALETTE, type MapPalette } from "./scales";
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

const BOUNDS: [[number, number], [number, number]] = [[-84, -57], [-33, 14]];
/** Label anchors that differ from the data centroid, to avoid collisions in the Guianas. */
const LABEL_POS: Record<string, [number, number]> = { GUY: [-59.4, 5.9], SUR: [-55.9, 3.9], GUF: [-53.2, 2.3] };

interface Props {
  /** fill colour per iso3 for in-scope countries; missing => no data */
  fills: Record<string, string | undefined>;
  values: Record<string, number | null>;
  countries: CountryMeta[];
  selected: string | null;
  onSelect: (iso3: string | null) => void;
  onHover?: (iso3: string | null) => void;
  describeValue: (iso3: string, v: number | null) => string;
  /** colour scheme in effect; the canvas cannot read CSS variables, so the palette is painted from here */
  theme?: Theme;
}

export function SouthAmericaMap({ fills, values, countries, selected, onSelect, onHover, describeValue, theme = "light" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dataRef = useRef<FC | null>(null);
  const hoverRef = useRef<string | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const callbacks = useRef({ onSelect, onHover, describeValue, values, fills });
  callbacks.current = { onSelect, onHover, describeValue, values, fills };
  const paletteRef = useRef<MapPalette>(MAP_PALETTE[theme]);
  paletteRef.current = MAP_PALETTE[theme];

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
      bounds: BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      minZoom: 1.5,
      maxZoom: 7,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Boundaries: Natural Earth (public domain)" }), "bottom-right");
    map.getCanvas().setAttribute("aria-label", "Map of South America; countries are coloured by the selected indicator. Use the country list for keyboard access.");
    map.getCanvas().setAttribute("role", "img");
    mapRef.current = map;

    map.on("load", async () => {
      const res = await fetch("/data/south-america.topo.json");
      const topo = (await res.json()) as Topology;
      const objName = Object.keys(topo.objects)[0];
      const fc = topoFeature(topo, topo.objects[objName] as GeometryCollection<CountryFeatureProps>) as unknown as FC;
      dataRef.current = fc;
      const pal = paletteRef.current;
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

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, maxWidth: "260px" });
      popupRef.current = popup;

      const setHover = (iso: string | null) => {
        if (hoverRef.current && hoverRef.current !== iso) map.setFeatureState({ source: "countries", id: hoverRef.current }, { hover: false });
        if (iso) map.setFeatureState({ source: "countries", id: iso }, { hover: true });
        hoverRef.current = iso;
        callbacks.current.onHover?.(iso);
      };

      map.on("mousemove", "countries-fill", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
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
        const p = f.properties as unknown as CountryFeatureProps;
        if (p.in_scope) callbacks.current.onSelect(p.iso3);
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      dataRef.current = null;
    };
    // countries list is static for the app's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update fills when the indicator changes.
  useEffect(() => {
    const map = mapRef.current;
    const fc = dataRef.current;
    if (!map || !fc) return;
    applyFills(fc, values, fills, paletteRef.current);
    const src = map.getSource("countries") as maplibregl.GeoJSONSource | undefined;
    src?.setData(fc);
  }, [fills, values]);

  // Repaint the sea, outlines and neutral fills when the colour scheme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("countries-fill")) return;
    paintTheme(map, MAP_PALETTE[theme]);
    const fc = dataRef.current;
    if (fc) {
      applyFills(fc, callbacks.current.values, callbacks.current.fills, MAP_PALETTE[theme]);
      (map.getSource("countries") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    }
  }, [theme]);

  // Update selection state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("countries")) return;
    for (const c of countries) map.setFeatureState({ source: "countries", id: c.iso3 }, { selected: c.iso3 === selected });
  }, [selected, countries, fills]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function paintTheme(map: MLMap, pal: MapPalette) {
  map.setPaintProperty("bg", "background-color", pal.sea);
  map.setPaintProperty("countries-fill", "fill-color", ["coalesce", ["get", "fill"], pal.noData]);
  map.setPaintProperty("countries-line", "line-color", ["case", ["boolean", ["feature-state", "selected"], false], pal.selected, pal.line]);
  map.setPaintProperty("countries-outscope-line", "line-color", pal.outScopeLine);
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
