import { interpolateRgb, piecewise } from "d3-interpolate";
import { scaleLinear, scaleSequential } from "d3-scale";
import { ACTOR_COLOR } from "@/lib/constants";

const NEUTRAL = "#f0efec";

/** Sequential, single hue light -> dark, for one actor's index value in [0, 100]. */
export function sequentialScale(actor: "US" | "CN") {
  const dark = ACTOR_COLOR[actor];
  return scaleSequential(piecewise(interpolateRgb, [NEUTRAL, dark])).domain([0, 100]);
}

/** Diverging, US blue <- neutral grey -> China vermilion, for CN minus US in [-100, 100]. */
export function divergingScale() {
  return scaleLinear<string>().domain([-60, 0, 60]).range([ACTOR_COLOR.US, NEUTRAL, ACTOR_COLOR.CN]).interpolate(interpolateRgb).clamp(true);
}

export function legendStops(mode: "US" | "CN" | "both", n = 7): { value: number; color: string }[] {
  if (mode === "both") {
    const s = divergingScale();
    return Array.from({ length: n }, (_, i) => {
      const v = -60 + (120 * i) / (n - 1);
      return { value: v, color: s(v) };
    });
  }
  const s = sequentialScale(mode);
  return Array.from({ length: n }, (_, i) => {
    const v = (100 * i) / (n - 1);
    return { value: v, color: s(v) };
  });
}
