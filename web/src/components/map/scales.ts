import { interpolateRgb, piecewise } from "d3-interpolate";
import { scaleLinear, scaleSequential } from "d3-scale";
import type { Theme } from "@/lib/theme";

/** Colours painted on the MapLibre canvas, which cannot read CSS variables; the values mirror globals.css
 *  (--map-sea, --map-land, --map-out, --card/--ink for the outlines, --us/--cn for the ramps). */
export const MAP_PALETTE = {
  light: { sea: "#e9eef2", noData: "#f0efec", outScope: "#e4e2dc", line: "#ffffff", selected: "#1b1d20", outScopeLine: "#9a9fa8", us: "#1f5fa8", cn: "#c8441c" },
  dark: { sea: "#121417", noData: "#2a2d32", outScope: "#1f2226", line: "#141516", selected: "#ecebe6", outScopeLine: "#6b6f76", us: "#4f8fdc", cn: "#e2682f" },
} as const;
export type MapPalette = (typeof MAP_PALETTE)[Theme];

/** Sequential, single hue from the neutral map colour to the actor hue, for one actor's index value in [0, 100]. */
export function sequentialScale(actor: "US" | "CN", theme: Theme = "light") {
  const p = MAP_PALETTE[theme];
  return scaleSequential(piecewise(interpolateRgb, [p.noData, actor === "US" ? p.us : p.cn])).domain([0, 100]);
}

/** Diverging, US blue <- neutral grey -> China vermilion, for CN minus US in [-100, 100]. */
export function divergingScale(theme: Theme = "light") {
  const p = MAP_PALETTE[theme];
  return scaleLinear<string>().domain([-60, 0, 60]).range([p.us, p.noData, p.cn]).interpolate(interpolateRgb).clamp(true);
}

export function legendStops(mode: "US" | "CN" | "both", n = 7, theme: Theme = "light"): { value: number; color: string }[] {
  if (mode === "both") {
    const s = divergingScale(theme);
    return Array.from({ length: n }, (_, i) => {
      const v = -60 + (120 * i) / (n - 1);
      return { value: v, color: s(v) };
    });
  }
  const s = sequentialScale(mode, theme);
  return Array.from({ length: n }, (_, i) => {
    const v = (100 * i) / (n - 1);
    return { value: v, color: s(v) };
  });
}
