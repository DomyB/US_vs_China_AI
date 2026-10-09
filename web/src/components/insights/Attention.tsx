"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { fmtMusd } from "@/lib/format";
import type { AttentionYear } from "@/lib/types";
import { COLORS, INK_3 } from "./shared";

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} bn` : `${v.toFixed(0)} m`);

function small(rows: AttentionYear[], key: "policy_docs" | "us_statements" | "dfc_musd" | "cn_musd", label: string, fill: string, lastYear: number | null, fmt: (v: number) => string, tick: (v: number) => string) {
  const data = rows.filter((r) => r[key] !== null);
  const gap = lastYear !== null && rows.some((r) => r.year > lastYear);
  const maxY = Math.max(1, ...rows.map((r) => r[key] ?? 0));
  return {
    height: 160,
    marginLeft: 54,
    marginBottom: 28,
    x: { label: null, domain: [2007.5, 2026.5], ticks: [2008, 2011, 2014, 2017, 2020, 2023, 2026], tickFormat: (d: number) => String(d) },
    y: { label, grid: true, tickFormat: tick, domain: [0, maxY * 1.05] },
    marks: [
      ...(gap ? [Plot.rect([{ x1: (lastYear as number) + 0.5, x2: 2026.5, y1: 0, y2: maxY * 1.05 }], { x1: "x1", x2: "x2", y1: "y1", y2: "y2", fill: INK_3, fillOpacity: 0.08 }), Plot.text([{ x: (lastYear as number) + 0.7, t: `no source after ${lastYear}` }], { x: "x", frameAnchor: "top", text: "t", textAnchor: "start", fill: INK_3, fontSize: 10, dy: 4 })] : []),
      Plot.rectY(data, { x1: (d: AttentionYear) => d.year - 0.42, x2: (d: AttentionYear) => d.year + 0.42, y: key, fill, tip: true, title: (d: AttentionYear) => `${d.year}: ${fmt(d[key] as number)}` }),
      Plot.ruleY([0]),
    ],
  };
}

export function Attention({ rows, lastYear }: { rows: AttentionYear[]; lastYear: { finance_US: number | null; finance_CN: number | null } }) {
  const o1 = useMemo(() => small(rows, "policy_docs", "US policy documents", COLORS.OTHER, null, (v) => `${v} documents`, (v) => String(v)), [rows]);
  const o2 = useMemo(() => small(rows, "us_statements", "Statements by US officials", COLORS.US, null, (v) => `${v} statements`, (v) => String(v)), [rows]);
  const o3 = useMemo(() => small(rows, "dfc_musd", "US DFC commitments (US$)", COLORS.US, lastYear.finance_US, (v) => fmtMusd(v), compact), [rows, lastYear.finance_US]);
  const o4 = useMemo(() => small(rows, "cn_musd", "Chinese commitments (US$)", COLORS.CN, lastYear.finance_CN, (v) => fmtMusd(v), compact), [rows, lastYear.finance_CN]);
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PlotFigure options={o1} ariaLabel="US policy documents on minerals per year" expandable={false} />
        <PlotFigure options={o2} ariaLabel="Statements by US officials on the region's minerals per year" expandable={false} />
        <PlotFigure options={o3} ariaLabel="US DFC documented commitments to the twelve countries per year" expandable={false} />
        <PlotFigure options={o4} ariaLabel="Chinese documented commitments to the twelve countries per year" expandable={false} />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-3">Same years on every panel. Policy documents: Congress.gov bills and Federal Register notices and rules selected by title (a bill is not a dollar). Statements: the owner&apos;s dataset, which begins in 2019. Commitments: documented amounts in the de-duplicated finance events; a shaded year has no source, not zero money.</p>
      <DataTable rows={rows} caption="Attention and money by year" columns={[{ key: "year", label: "Year" }, { key: "policy_docs", label: "Policy docs" }, { key: "us_statements", label: "US statements" }, { key: "statements", label: "All statements" }, { key: "dfc_musd", label: "DFC (US$ m)", format: (v) => (v === null ? "no source" : String(v)) }, { key: "cn_musd", label: "China (US$ m)", format: (v) => (v === null ? "no source" : String(v)) }]} />
    </div>
  );
}
