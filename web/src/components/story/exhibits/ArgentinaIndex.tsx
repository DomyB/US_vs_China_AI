"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR } from "@/lib/constants";
import type { IndexRow } from "@/lib/types";
import { Exhibit } from "../Chapter";

function netLean(rows: IndexRow[]): Plot.PlotOptions {
  const long = rows.map((r) => ({ year: r.year, actor: r.actor, value: r.value, lower: r.lower, upper: r.upper, n: r.n_components ?? null }));
  // One label per actor at its own last year (the two records end in different years), nudged apart when the series end within 6 points (≈ 12 px) of each other.
  const last = new Map<string, (typeof long)[number] & { ly: number }>();
  for (const d of long) if ((last.get(d.actor)?.year ?? -Infinity) < d.year) last.set(d.actor, { ...d, ly: d.value });
  const labels = [...last.values()].sort((a, b) => a.value - b.value);
  for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 6) labels[i].ly = labels[i - 1].ly + 6;
  return {
    height: 240,
    marginTop: 26,
    marginLeft: 40,
    marginRight: 112,
    x: { label: null, tickFormat: (d: number) => String(d) },
    y: { label: "influence index (0–100)", domain: [0, 100] },
    color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN] },
    marks: [
      Plot.areaY(long, { x: "year", y1: "lower", y2: "upper", fill: "actor", fillOpacity: 0.12, z: "actor" }),
      Plot.lineY(long, { x: "year", y: "value", stroke: "actor", strokeWidth: 2.2, z: "actor" }),
      Plot.dot(long, { x: "year", y: "value", fill: "actor", r: 2.5, tip: true, title: (d: { year: number; actor: string; value: number; lower: number | null; upper: number | null; n: number | null }) => `${d.year} · ${d.actor === "CN" ? "China" : "United States"}: ${d.value.toFixed(1)}${d.lower !== null && d.upper !== null ? ` (5th–95th ${d.lower.toFixed(0)}–${d.upper.toFixed(0)}` : " (no band"}; ${d.n ?? "–"} components)` }),
      Plot.text(labels, { x: "year", y: "ly", text: (d: { actor: string; value: number; n: number | null }) => `${d.actor === "CN" ? "China" : "US"} ${d.value.toFixed(0)} (${d.n ?? "–"} comp.)`, textAnchor: "start", dx: 6, fontSize: 10, fill: "actor" }),
      Plot.ruleY([0]),
    ],
  };
}

/** The years both indices carry, in order: the trajectory's points (a year with one actor's value only is not a point on it). */
function bothActors(rows: IndexRow[]): { year: number; US: number; CN: number }[] {
  const byYear = new Map<number, { year: number; US?: number; CN?: number }>();
  for (const r of rows) {
    const y = byYear.get(r.year) ?? { year: r.year };
    y[r.actor] = r.value;
    byYear.set(r.year, y);
  }
  return [...byYear.values()].filter((y) => y.US !== undefined && y.CN !== undefined).sort((a, b) => a.year - b.year) as { year: number; US: number; CN: number }[];
}

function trajectory(rows: IndexRow[]): Plot.PlotOptions {
  const pts = bothActors(rows);
  const max = Math.max(60, ...pts.map((p) => Math.max(p.US, p.CN))) * 1.1;
  return {
    height: 260,
    marginTop: 26,
    marginBottom: 40,
    marginLeft: 40,
    aspectRatio: 1,
    x: { label: "US index →", labelAnchor: "center", domain: [0, max] },
    y: { label: "↑ China index", domain: [0, max] },
    marks: [
      Plot.line([{ x: 0, y: 0 }, { x: max, y: max }], { x: "x", y: "y", stroke: "var(--rule-2)", strokeDasharray: "4 3" }),
      Plot.text([{ x: max * 0.95, y: max * 0.95, t: "equal presence" }], { x: "x", y: "y", text: "t", textAnchor: "end", dy: -6, fontSize: 9, fill: "var(--ink-3)" }),
      Plot.line(pts, { x: "US", y: "CN", stroke: "var(--ink)", strokeWidth: 1.4, curve: "linear", markerEnd: "arrow" }),
      Plot.dot(pts, { x: "US", y: "CN", r: 3, fill: (d: { year: number }) => (d.year === pts[pts.length - 1].year ? "var(--cn)" : "var(--card)"), stroke: "var(--ink)", tip: true, title: (d: { year: number; US: number; CN: number }) => `${d.year}: US ${d.US.toFixed(1)}, China ${d.CN.toFixed(1)}` }),
      Plot.text(pts.slice(-1), { x: "US", y: "CN", text: (d: { year: number }) => String(d.year), textAnchor: "start", dx: 7, dy: -8, fontSize: 10, fill: "var(--ink)", stroke: "var(--card)", strokeWidth: 3 }),
    ],
  };
}

const SOURCES = ["un_comtrade", "aiddata_gcdf", "dfc_projects", "unga_votes", "wb_ids"];

/**
 * Argentina's influence index and its trajectory (chapter 8's two model exhibits, in the appendix). `rows` are the real
 * export's composite rows for Argentina over all minerals (lib/story.ts argentinaIndexRows); with none, one empty
 * frame says the index is not in the release, never two empty charts.
 */
export function ArgentinaIndex({ rows }: { rows: IndexRow[] }) {
  const lean = useMemo(() => netLean(rows), [rows]);
  const traj = useMemo(() => trajectory(rows), [rows]);
  if (!rows.length) {
    return (
      <Exhibit id="c8-index" title="The influence index" layer="model" sources={SOURCES} ids={["index_value:influence:ARG:US", "index_value:influence:ARG:CN"]} asks="Taking the six components together, how present has each power been in Argentina year by year? Two lines with their bands would show the gap; this release holds no computed index, so the frame is empty." how="An empty frame is a missing record, not a zero: nothing is drawn until the real export carries the index." note="Model output: the computed index is drawn only from the real export; a seeded sample is never shown in its place.">
        <p className="py-6 text-sm text-ink-2">The computed influence index is not in this release: nothing is drawn in its place.</p>
      </Exhibit>
    );
  }
  const years = rows.map((r) => r.year);
  const pts = bothActors(rows);
  const span = pts.length ? { first: pts[0].year, last: pts[pts.length - 1].year } : null;
  const cnRows = rows.filter((r) => r.actor === "CN"), usRows = rows.filter((r) => r.actor === "US");
  const peak = cnRows.length ? cnRows.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const usPeak = usRows.length ? usRows.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  // the years both bands hold in which they overlap: the order of the lines there is within what the weights can resolve
  const overlapYears = pts.filter((p) => {
    const cn = cnRows.find((r) => r.year === p.year), us = usRows.find((r) => r.year === p.year);
    return cn && us && cn.lower !== null && cn.upper !== null && us.lower !== null && us.upper !== null && cn.lower <= us.upper && us.lower <= cn.upper;
  }).length;
  const last = pts.length ? pts[pts.length - 1] : null;
  const first = pts.length ? pts[0] : null;
  const above = pts.filter((p) => p.CN > p.US).length;
  const crossings = pts.slice(1).filter((p, i) => Math.sign(p.CN - p.US) !== Math.sign(pts[i].CN - pts[i].US)).length;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Exhibit
        id="c8-index"
        title={`The influence index, ${Math.min(...years)}–${Math.max(...years)}`}
        layer="model"
        sources={SOURCES}
        ids={["index_value:influence:ARG:US", "index_value:influence:ARG:CN"]}
        asks="Taking the six components together, how present has each power been in Argentina year by year, and how far apart are they? Two lines with their bands show the gap and how much of it the weights could erase."
        how="One line per power, blue for the United States and red for China, on the 0–100 index; the shaded band around each is the 5th to 95th percentile over 500 weight draws; the end label carries the last value and the number of components behind it, and every dot prints its count on hover. Where the bands overlap, the order of the two lines could be an artefact of the weights."
        findings={[
          peak ? `China's line peaks at ${peak.value.toFixed(1)} in ${peak.year}${usPeak ? `; the US line at ${usPeak.value.toFixed(1)} in ${usPeak.year}` : ""}.` : null,
          last ? `In ${last.year}, the last year both hold, China reads ${last.CN.toFixed(1)} against ${last.US.toFixed(1)} for the United States.` : null,
          pts.length ? `The two bands overlap in ${overlapYears} of the ${pts.length} years both indices hold.` : null,
        ]}
        findingsKind="model"
        says={peak ? `China's line reaches its highest value, ${peak.value.toFixed(1)}, in ${peak.year}; the two bands overlap through most of the period, so in many years the gap between the lines is narrower than the weights can resolve. A step that coincides with a changed component count is a change in coverage, not in presence.` : "The two bands overlap through most of the period, so in many years the gap between the lines is narrower than the weights can resolve. A step that coincides with a changed component count is a change in coverage, not in presence."}
        saysKind="model"
        note="Model output: six components on one 0–100 scale, equal weights over the components available (never fewer than three)."
      >
        <PlotFigure glyph="model" options={lean} ariaLabel="Argentina's influence index for the United States and China by year with uncertainty bands" />
      </Exhibit>
      <Exhibit
        id="c8-trajectory"
        title="The trajectory"
        layer="model"
        sources={["un_comtrade", "aiddata_gcdf", "dfc_projects", "unga_votes"]}
        ids={["index_value:influence:ARG"]}
        asks="Did the two presences move together or apart? Plotting one index against the other, year by year, shows the path in one frame instead of two lines."
        how={`One dot per year that both indices hold${span ? `, ${span.first} to ${span.last}` : ""}, US index across and China index up, joined in order and ending in an arrow; the filled dot is the last year; the dashed diagonal is equal presence, so a point above it is a year China's index was the larger. A year with only one actor's value is not a point.`}
        findings={[
          pts.length ? `${above} of the ${pts.length} years sit above the diagonal, China's index the larger.` : null,
          first && last ? `The path runs from ${first.year} (US ${first.US.toFixed(0)}, China ${first.CN.toFixed(0)}) to ${last.year} (US ${last.US.toFixed(0)}, China ${last.CN.toFixed(0)}).` : null,
          pts.length > 1 ? `It crosses the diagonal ${crossings} time${crossings === 1 ? "" : "s"}.` : null,
        ]}
        findingsKind="model"
        says="The path spends most of its years above the diagonal, China's index the larger, and drifts rather than runs; where it crosses the line, the chart beside shows whether a component count changed in the same year."
        saysKind="model"
        note="The early years sit in the knot at the left, the year on hover."
      >
        <PlotFigure glyph="model" options={traj} ariaLabel="Argentina's trajectory: US index against China index, one dot per year" expandable={false} />
      </Exhibit>
    </div>
  );
}
