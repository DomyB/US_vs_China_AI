"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_LABEL, COUNTRY_NAMES } from "@/lib/constants";
import type { Actor, EventEcho } from "@/lib/types";
import { COLORS, INK_3, fmtPts } from "./shared";

interface W { label: string; family: string; actor: Actor; country: string; year: number; diff: number; placebo_p: number | null; title: string }

export function Shocks({ echoes, titles, selected }: { echoes: EventEcho[]; titles: Record<string, string>; selected: string | null }) {
  const fams = useMemo(() => echoes.filter((e) => e.actor === "CN" && e.n >= 2).sort((a, b) => b.n - a.n).map((e) => e.label), [echoes]);
  const windows = useMemo<W[]>(() => echoes.filter((e) => fams.includes(e.label)).flatMap((e) => e.windows.map((w) => ({ label: e.label, family: e.family, actor: e.actor, country: w.country, year: w.year, diff: w.diff, placebo_p: w.placebo_p, title: titles[w.event_id] ?? w.event_id }))), [echoes, fams, titles]);
  const means = useMemo(() => echoes.filter((e) => fams.includes(e.label)).map((e) => ({ label: e.label, actor: e.actor, mean: e.mean, n: e.n, family: e.family })), [echoes, fams]);
  const nDraft = useMemo(() => { const ids = new Map<string, string>(); for (const e of echoes) for (const w of e.windows) ids.set(w.event_id, w.status); return [Array.from(ids.values()).filter((s) => s !== "reviewed").length, ids.size]; }, [echoes]);
  const draftNote = nDraft[0] === 0 ? "Every event is reviewed." : nDraft[0] === nDraft[1] ? "Every event is still in draft." : `${nDraft[0]} of ${nDraft[1]} events are still in draft.`;
  const options = useMemo(
    () => ({
      height: 70 + 44 * fams.length,
      marginLeft: 232,
      marginBottom: 44,
      x: { label: "change in the export share, two years after minus two years before (points)", tickFormat: (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`, grid: true },
      y: { label: null, domain: fams },
      color: { domain: ["US", "CN"], range: [COLORS.US, COLORS.CN], legend: true, tickFormat: (d: string) => `share to ${ACTOR_LABEL[d as Actor]}` },
      marks: [
        Plot.ruleX([0], { stroke: INK_3 }),
        ...(["US", "CN"] as Actor[]).flatMap((a) => [
          Plot.dot(windows.filter((w) => w.actor === a), { x: "diff", y: "label", fill: "actor", r: 4, fillOpacity: (d: W) => (selected && d.family !== selected ? 0.25 : 0.65), dy: a === "US" ? -7 : 7, tip: true, title: (d: W) => `${COUNTRY_NAMES[d.country] ?? d.country} after ${d.title} (${d.year}): share to ${ACTOR_LABEL[d.actor]} ${fmtPts(d.diff)}${d.placebo_p !== null ? `, placebo p ${d.placebo_p.toFixed(2)}` : ""}` }),
          Plot.tickX(means.filter((m) => m.actor === a), { x: "mean", y: "label", stroke: "actor", strokeWidth: 3, dy: a === "US" ? -7 : 7, tip: true, title: (d: { label: string; actor: Actor; mean: number; n: number }) => `${d.label}: mean ${fmtPts(d.mean)} for the share to ${ACTOR_LABEL[d.actor]} over ${d.n} windows` }),
        ]),
      ],
    }),
    [windows, means, fams, selected],
  );
  if (!fams.length) return <p className="text-sm text-ink-3">No event family has enough windows yet.</p>;
  return (
    <div>
      <PlotFigure options={options} ariaLabel="Post-minus-pre changes of the export share after each event family, one dot per event and country, with the family mean as a tick" />
      <p className="mt-1 text-[11px] leading-snug text-ink-3">Each dot is one event in one country (the shock lever above uses the family mean and middle half). {draftNote} Windows overlap and the years coincide with price swings, so read a direction, not an effect.</p>
      <DataTable rows={windows} caption="Event windows" columns={[{ key: "label", label: "Family" }, { key: "country", label: "Country" }, { key: "year", label: "Year" }, { key: "actor", label: "Share to" }, { key: "diff", label: "Change", format: (v) => fmtPts(Number(v)) }, { key: "placebo_p", label: "Placebo p" }]} />
    </div>
  );
}
