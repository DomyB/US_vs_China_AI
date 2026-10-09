"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { fmtSigned } from "@/lib/format";

export type RegionMeasure = "net" | "US" | "CN";
export interface MeasureRow {
  iso3: string;
  name: string;
  year: number;
  value: number;
}

export const MEASURE_LABEL: Record<RegionMeasure, string> = { net: "Net lean (China minus US)", US: "US influence index", CN: "China influence index" };
export const fmtMeasure = (measure: RegionMeasure, v: number) => (measure === "net" ? fmtSigned(v, 0) : v.toFixed(0));

/** Twelve muted lines, one highlighted: hover or pin a country in the ranking to follow it; the pointer reads any point. */
export function FocusChart({ rows, focus, year, measure, ariaLabel }: { rows: MeasureRow[]; focus: string | null; year: number; measure: RegionMeasure; ariaLabel: string }) {
  const options = useMemo(() => {
    const focusRows = focus ? rows.filter((r) => r.iso3 === focus) : [];
    const last = focusRows.at(-1);
    const hue = measure === "US" ? "#1f5fa8" : measure === "CN" ? "#c8441c" : "#1b1d20";
    const domain: [number, number] = measure === "net" ? [-100, 100] : [0, 100];
    return {
      height: 440,
      marginLeft: 44,
      marginRight: 96,
      x: { label: null, tickFormat: (d: number) => String(d), domain: [2008, 2026] },
      y: { label: MEASURE_LABEL[measure], domain, grid: true },
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
  }, [rows, focus, year, measure]);
  return <PlotFigure options={options} ariaLabel={ariaLabel} />;
}
