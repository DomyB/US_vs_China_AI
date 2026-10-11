"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { fmtSigned } from "@/lib/format";
import { YEAR_MIN, YEAR_MAX } from "@/lib/constants";
import { INDEX_LABEL, type IndexName } from "@/lib/indexView";
import { NET_LEAN_MAX } from "@/components/map/scales";

export type RegionMeasure = "net" | "US" | "CN";
export interface MeasureRow {
  iso3: string;
  name: string;
  year: number;
  value: number;
}

export const MEASURE_LABEL: Record<RegionMeasure, string> = { net: "Net lean (China minus US)", US: "US influence index", CN: "China influence index" };
/** The measure's label naming the index it is taken from ("Net lean (China minus US), economic ties"). */
export function measureLabel(measure: RegionMeasure, indexName: IndexName = "composite"): string {
  if (measure === "net") return `${MEASURE_LABEL.net}, ${INDEX_LABEL[indexName].toLowerCase()}`;
  return `${measure === "US" ? "US" : "China"} ${INDEX_LABEL[indexName].toLowerCase()}`;
}
export const fmtMeasure = (measure: RegionMeasure, v: number) => (measure === "net" ? fmtSigned(v, 0) : v.toFixed(0));

/** Country-years whose net lean lies beyond the ±NET_LEAN_MAX axis: drawn at the edge, printed in full by the pointer and the table. */
export function beyondRange(rows: MeasureRow[], measure: RegionMeasure): number {
  return measure === "net" ? rows.filter((r) => Math.abs(r.value) > NET_LEAN_MAX).length : 0;
}

/**
 * Twelve muted lines, one highlighted: hover or pin a country in the ranking to follow it; the pointer reads any point.
 * Net lean runs on the one ±NET_LEAN_MAX scale every view draws it on (the map, the ranking, the heatmap, Compare); the
 * axis is clamped, so a rare country-year beyond it sits on the edge and keeps its true value in the tip, the label and
 * the table beneath (`beyondRange` counts them for the caption).
 */
export function FocusChart({ rows, focus, year, measure, indexName = "composite", ariaLabel }: { rows: MeasureRow[]; focus: string | null; year: number; measure: RegionMeasure; indexName?: IndexName; ariaLabel: string }) {
  const options = useMemo(() => {
    const focusRows = focus ? rows.filter((r) => r.iso3 === focus) : [];
    const last = focusRows.at(-1);
    const hue = measure === "US" ? "#1f5fa8" : measure === "CN" ? "#c8441c" : "#1b1d20";
    const domain: [number, number] = measure === "net" ? [-NET_LEAN_MAX, NET_LEAN_MAX] : [0, 100];
    return {
      height: 440,
      marginLeft: 44,
      marginRight: 96,
      x: { label: null, tickFormat: (d: number) => String(d), domain: [YEAR_MIN, YEAR_MAX] },
      y: { label: measureLabel(measure, indexName), domain, grid: true, clamp: true },
      marks: [
        ...(measure === "net" ? [Plot.ruleY([0], { stroke: "#8a8f98" })] : []),
        Plot.lineY(rows, { x: "year", y: "value", z: "iso3", stroke: "#c9c7c0", strokeWidth: 1.4, curve: "monotone-x" }),
        ...(focusRows.length
          ? [
              Plot.lineY(focusRows, { x: "year", y: "value", stroke: hue, strokeWidth: 3, curve: "monotone-x" }),
              Plot.dot(focusRows.filter((r) => r.year === year), { x: "year", y: "value", fill: hue, r: 5, stroke: "#fff", strokeWidth: 1.5 }),
              ...(last ? [Plot.text([last], { x: "year", y: "value", text: (d: MeasureRow) => `${d.name} ${fmtMeasure(measure, d.value)}`, dx: 8, textAnchor: "start", fill: "#1b1d20", fontSize: 12, fontWeight: 600 })] : []),
            ]
          : []),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
        Plot.tip(rows, Plot.pointer({ x: "year", y: "value", title: (d: MeasureRow) => `${d.year} ${d.name}: ${fmtMeasure(measure, d.value)}` })),
      ],
    };
  }, [rows, focus, year, measure, indexName]);
  return <PlotFigure options={options} ariaLabel={ariaLabel} />;
}
