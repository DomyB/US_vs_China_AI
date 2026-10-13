"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DataTable } from "@/components/charts/PlotFigure";
import { RankingRace } from "@/components/charts/RankingRace";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { fmtAmount, type FlowAgg, type FlowView } from "@/components/map/flows";
import { NET_LEAN_MAX } from "@/components/map/scales";
import { LayerLabel } from "@/components/ui/Badges";
import { StatTile } from "@/components/ui/Section";
import { ACTOR_LABEL, COUNTRY_COUNT } from "@/lib/constants";
import { INDEX_PHRASE, carriedBy, leadSentence, type IndexName, type Lead, type LeadSummary } from "@/lib/indexView";
import type { ActorMode, Meta, RealMeta } from "@/lib/types";

interface Props {
  meta: Meta;
  real: RealMeta | null;
  indexLayer: "real" | "sample" | "none";
  year: number;
  mode: ActorMode;
  mineral: string;
  /** which index colours the map and orders the ranking */
  indexName: IndexName;
  ranked: { iso: string; name: string; v: number }[];
  /** `${iso3}|${year}` → the component that carries the composite lean (all minerals), where the file says */
  leads: Map<string, Lead>;
  /** what carries the lean across the ranked countries in the year; null when the file cannot say */
  leadLine: LeadSummary | null;
  /** why some countries have no index in the year; null when every country has one or the index is the sample */
  indexNote: string | null;
  onSelect: (iso: string, additive?: boolean) => void;
  onHover: (iso: string | null) => void;
  hover: string | null;
  view: FlowView;
  aggs: FlowAgg[];
  /** how far each flow source reaches, to say when a window lies beyond it */
  flowsLastYear?: { finance_CN: number | null; finance_US: number | null; trade: number | null } | null;
  window?: [number, number];
  sourceNames: Record<string, { name: string }>;
  compareMode: boolean;
  selection: string[];
}

/** Drawer content when no country is open: the headline numbers, the ranking (hover links to the map) and the flows as a table. */
export function Overview({ meta, real, indexLayer, year, mode, mineral, indexName, ranked, leads, leadLine, indexNote, onSelect, onHover, hover, view, aggs, flowsLastYear, window, sourceNames, compareMode, selection }: Props) {
  const kpis = useMemo(() => {
    const cov = real ? Object.values(real.coverage) : [];
    return { sources: real?.sources_live?.live ?? real?.sources_ok.length ?? null, sourcesTotal: real?.sources_live?.total ?? null, facts: cov.filter((c) => c.actions).length, indexed: cov.filter((c) => c.analysis_available).length, asOf: real?.generated_on ?? null };
  }, [real]);
  const names = useMemo(() => Object.fromEntries(meta.countries.map((c) => [c.iso3, c.name])), [meta]);
  const flowRows = useMemo(
    () => aggs.map((a) => ({ country: names[a.iso3] ?? a.iso3, actor: ACTOR_LABEL[a.actor], amount: a.amount, n: a.n, n_amount: a.nAmount, window: a.from === a.to ? String(a.to) : `${a.from}–${a.to}`, sources: a.sources.map((s) => sourceNames[s]?.name ?? s).join(", ") })),
    [aggs, names, sourceNames],
  );
  // the component behind each ranked country's lean, for the list under the ranking (composite, all minerals, both actors)
  const carried = useMemo(
    () => (mode === "both" && mineral === "all" && indexName === "composite" ? ranked.map((r) => ({ iso: r.iso, name: r.name, text: carriedBy(leads.get(`${r.iso}|${year}`)) })).filter((r): r is { iso: string; name: string; text: string } => r.text !== null) : []),
    [mode, mineral, indexName, ranked, leads, year],
  );
  const scaleLabel = mode === "both" ? `net lean, China index minus US index, in points of the 0–100 scale · ${INDEX_PHRASE[indexName]}` : `${mode === "US" ? "United States" : "China"} ${INDEX_PHRASE[indexName]}, 0–100`;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <p className="eyebrow">{compareMode ? "Compare" : "Overview"}</p>
        <h2 className="mt-0.5 text-lg leading-tight">{compareMode ? "Pick up to four countries" : "Select a country"}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {compareMode ? (
            `Click countries on the map or in the ranking; ${selection.length ? `${selection.length} picked so far.` : "two or more open the comparison."}`
          ) : (
            <>
              Click the map or the ranking to open the five tabs: actions, politics, media, analysis and forecast.{" "}
              <span className="pointer-coarse:hidden">Shift-click adds a country to a comparison.</span>
              <span className="hidden pointer-coarse:inline">Use Compare to put countries side by side.</span>
            </>
          )}
        </p>
        {!compareMode && <Link href="/explore?tour=1" className="mt-2 inline-block text-xs underline decoration-dotted">New here? Take the two-minute tour</Link>}
      </div>
      {real && (
        <div className="grid grid-cols-2 gap-2">
          <StatTile icon="calendar" label="Data as of" value={kpis.asOf ? new Date(kpis.asOf + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–"} note="press weekly · the rest monthly" />
          <StatTile icon="sources" label="Live sources" value={kpis.sources !== null ? <AnimatedNumber value={kpis.sources} /> : "–"} note={`of ${kpis.sourcesTotal ?? Object.keys(sourceNames).length} registered`} href="/sources" />
          <StatTile icon="facts" label="Countries with facts" value={<><AnimatedNumber value={kpis.facts} /> / {COUNTRY_COUNT}</>} note="trade, finance, governance" />
          <StatTile icon="index" label="Countries indexed" value={<><AnimatedNumber value={kpis.indexed} /> / {COUNTRY_COUNT}</>} note="≥ 3 of 6 components" href="/methodology#index" />
        </div>
      )}
      <section aria-labelledby="rk-h">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="rk-h" className="text-base font-semibold">Ranking in {year}{mineral !== "all" ? ` · ${mineral.replace(/_/g, " ")}` : ""}</h3>
          <span className="text-[11px] text-ink-3">{scaleLabel}{indexLayer === "real" ? " · computed" : " · sample"}</span>
        </div>
        {ranked.length === 0 ? (
          <p className="text-sm text-ink-3">{indexNote ?? "No index for this selection."}</p>
        ) : (
          <RankingRace rows={ranked} mode={mode} max={mode === "both" ? NET_LEAN_MAX : 100} onSelect={onSelect} onHover={onHover} hover={hover} selection={selection} />
        )}
        {leadLine && <p className="mt-1.5 text-[11px] leading-snug text-ink-2">{leadSentence(leadLine)}</p>}
        {carried.length > 0 && (
          <details className="mt-1 text-[11px] text-ink-3">
            <summary className="cursor-pointer">What carries each country&apos;s lean in {year}</summary>
            <ul className="mt-1 space-y-0.5">
              {carried.map((r) => (
                <li key={r.iso} onMouseEnter={() => onHover(r.iso)} onMouseLeave={() => onHover(null)}><span className="text-ink-2">{r.name}</span>: {r.text}</li>
              ))}
            </ul>
            <p className="mt-1">The component available for both actors with the widest gap between their normalised values, in points of the 0–100 component scale.</p>
          </details>
        )}
        {ranked.length > 0 && indexNote && <p className="mt-1 text-[11px] text-ink-3">{indexNote}</p>}
      </section>
      {view !== "index" && (
        <section aria-labelledby="fl-h">
          <h3 id="fl-h" className="text-base font-semibold">{view === "money" ? "Money flows" : "Trade flows"} on the map</h3>
          <p className="mt-0.5 text-[11px] text-ink-3">{aggs.length} arcs drawn. Every arc&apos;s numbers and sources are in the table; hover an arc for the same.</p>
          {view === "money" && window && flowsLastYear && (
            <>
              {flowsLastYear.finance_CN !== null && window[0] > flowsLastYear.finance_CN && <p className="mt-1 rounded-md border border-sample/40 bg-sample/10 px-2 py-1 text-[11px] text-sample">No Chinese finance data in {window[0] === window[1] ? String(window[0]) : `${window[0]}–${window[1]}`}: the AidData series ends in {flowsLastYear.finance_CN}. Move the year to {flowsLastYear.finance_CN} or widen the window.</p>}
              {flowsLastYear.finance_US !== null && window[0] > flowsLastYear.finance_US && <p className="mt-1 rounded-md border border-sample/40 bg-sample/10 px-2 py-1 text-[11px] text-sample">No US finance data in this window: the DFC and EXIM series ends in {flowsLastYear.finance_US}.</p>}
            </>
          )}
          {aggs.length === 0 ? (
            <p className="mt-1 text-sm text-ink-3">No flows in this window.</p>
          ) : (
            <DataTable
              rows={flowRows}
              caption={`${view === "money" ? "Documented commitments" : "Reported exports"} by country and actor`}
              columns={[
                { key: "country", label: "Country" },
                { key: "actor", label: view === "money" ? "From" : "To" },
                { key: "amount", label: "M US$", format: (v) => fmtAmount(Number(v)).replace("US$ ", "") },
                { key: "n", label: view === "money" ? "Events" : "Years" },
                ...(view === "money" ? [{ key: "n_amount" as const, label: "With amount" }] : []),
                { key: "window", label: "Window" },
                { key: "sources", label: "Sources" },
              ]}
            />
          )}
        </section>
      )}
      <div className="text-xs text-ink-3">
        <p className="eyebrow mb-1">How to read the site</p>
        <ul className="space-y-1">
          <li><LayerLabel layer="facts" /> sourced data, every number linked to its source and reliability rating.</li>
          <li><LayerLabel layer="model" /> indices, stance scores, flags and forecasts, each with its method and validation status.</li>
          <li><LayerLabel layer="interpretation" /> written analysis generated from named indicators, and the owner&apos;s own text, kept apart.</li>
        </ul>
        <p className="mt-2">Refresh: {meta.refresh_schedule.map((r) => `${r.layer} ${r.cadence}`).join(" · ")}.</p>
      </div>
    </div>
  );
}
