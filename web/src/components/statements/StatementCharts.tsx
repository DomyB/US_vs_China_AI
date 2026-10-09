"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR, ACTOR_LABEL } from "@/lib/constants";
import type { StatementStanceYear } from "@/lib/types";
import { BLOC_ORDER, blocColor, blocShort } from "./blocs";

/** Statements per year, stacked by speaker bloc. */
export function StatementsByYear({ rows, ariaLabel }: { rows: { year: number; bloc: string; n: number }[]; ariaLabel: string }) {
  const options = useMemo(() => {
    const blocs = BLOC_ORDER.filter((b) => rows.some((r) => r.bloc === b)).concat(Array.from(new Set(rows.map((r) => r.bloc))).filter((b) => !BLOC_ORDER.includes(b)));
    return {
      height: 220,
      marginLeft: 36,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Statements", grid: true },
      color: { domain: blocs, range: blocs.map(blocColor), legend: true, tickFormat: (d: string) => blocShort(d) },
      marks: [Plot.barY(rows, { x: "year", y: "n", fill: "bloc", order: blocs, insetTop: 1, tip: true, title: (d: { year: number; bloc: string; n: number }) => `${d.year} · ${blocShort(d.bloc)}: ${d.n} statement${d.n === 1 ? "" : "s"}` }), Plot.ruleY([0])],
    };
  }, [rows]);
  return <PlotFigure options={options} ariaLabel={ariaLabel} />;
}

/** The dataset's coded stance of domestic speakers by year toward each actor: mean of +1 / 0 / −1, dot size = statements that take a position. */
export function CodedStanceByYear({ rows, year, ariaLabel }: { rows: StatementStanceYear[]; year: number; ariaLabel: string }) {
  const long = useMemo(() => {
    const out: { year: number; actor: "US" | "CN"; mean: number; n: number }[] = [];
    for (const r of rows) {
      if (r.stance_cn_mean !== null && r.n_cn > 0) out.push({ year: r.year, actor: "CN", mean: r.stance_cn_mean, n: r.n_cn });
      if (r.stance_us_mean !== null && r.n_us > 0) out.push({ year: r.year, actor: "US", mean: r.stance_us_mean, n: r.n_us });
    }
    return out;
  }, [rows]);
  const options = useMemo(
    () => ({
      height: 220,
      marginLeft: 64,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Coded stance (−1 to +1)", domain: [-1.15, 1.15], ticks: [-1, 0, 1], tickFormat: (d: number) => (d === 1 ? "positive" : d === -1 ? "negative" : "neutral"), grid: true },
      r: { range: [3, 12] },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => `toward ${ACTOR_LABEL[d as "US" | "CN"]}` },
      marks: [
        Plot.ruleY([0], { stroke: "#8a8f98" }),
        Plot.lineY(long, { x: "year", y: "mean", stroke: "actor", strokeWidth: 1, strokeOpacity: 0.5, curve: "linear" }),
        Plot.dot(long, { x: "year", y: "mean", r: "n", fill: "actor", fillOpacity: 0.85, stroke: "#fff", tip: true, title: (d: { year: number; actor: string; mean: number; n: number }) => `${d.year} toward ${ACTOR_LABEL[d.actor as "US" | "CN"]}: ${d.mean > 0 ? "+" : ""}${d.mean.toFixed(2)} over ${d.n} statement${d.n === 1 ? "" : "s"} that took a position` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [long, year],
  );
  return <PlotFigure options={options} ariaLabel={ariaLabel} />;
}
