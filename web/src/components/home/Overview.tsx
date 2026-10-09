"use client";

import { useMemo } from "react";
import { DataTable } from "@/components/charts/PlotFigure";
import { fmtAmount, type FlowAgg, type FlowView } from "@/components/map/flows";
import { LayerLabel } from "@/components/ui/Badges";
import { StatTile } from "@/components/ui/Section";
import { ACTOR_LABEL } from "@/lib/constants";
import { fmtSigned } from "@/lib/format";
import type { ActorMode, Meta, RealMeta } from "@/lib/types";

interface Props {
  meta: Meta;
  real: RealMeta | null;
  indexLayer: "real" | "sample" | "none";
  year: number;
  mode: ActorMode;
  mineral: string;
  ranked: { iso: string; name: string; v: number }[];
  onSelect: (iso: string) => void;
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
export function Overview({ meta, real, indexLayer, year, mode, mineral, ranked, onSelect, onHover, hover, view, aggs, flowsLastYear, window, sourceNames, compareMode, selection }: Props) {
  const kpis = useMemo(() => {
    const cov = real ? Object.values(real.coverage) : [];
    return { sources: real?.sources_ok.length ?? null, facts: cov.filter((c) => c.actions).length, indexed: cov.filter((c) => c.analysis_available).length, asOf: real?.generated_on ?? null };
  }, [real]);
  const maxAbs = useMemo(() => Math.max(1, ...ranked.map((r) => Math.abs(r.v))), [ranked]);
  const names = useMemo(() => Object.fromEntries(meta.countries.map((c) => [c.iso3, c.name])), [meta]);
  const flowRows = useMemo(
    () => aggs.map((a) => ({ country: names[a.iso3] ?? a.iso3, actor: ACTOR_LABEL[a.actor], amount: a.amount, n: a.n, n_amount: a.nAmount, window: a.from === a.to ? String(a.to) : `${a.from}–${a.to}`, sources: a.sources.map((s) => sourceNames[s]?.name ?? s).join(", ") })),
    [aggs, names, sourceNames],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <p className="eyebrow">{compareMode ? "Compare" : "Overview"}</p>
        <p className="serif mt-0.5 text-xl text-ink">{compareMode ? "Pick up to four countries" : "Select a country"}</p>
        <p className="mt-1 text-sm text-ink-2">
          {compareMode
            ? `Click countries on the map or in the ranking; ${selection.length ? `${selection.length} picked so far.` : "two or more open the comparison."}`
            : "Click the map or the ranking to open the five tabs: actions, parliament, media, analysis and forecast. Shift-click adds a country to a comparison."}
        </p>
      </div>
      {real && (
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Data as of" value={kpis.asOf ? new Date(kpis.asOf + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–"} note="monthly refresh" />
          <StatTile label="Live sources" value={kpis.sources ?? "–"} note="of 187 registered" href="/sources" />
          <StatTile label="Countries with facts" value={`${kpis.facts} / 12`} note="trade, finance, governance" />
          <StatTile label="Countries indexed" value={`${kpis.indexed} / 12`} note="≥ 3 of 6 components" href="/methodology#index" />
        </div>
      )}
      <section aria-labelledby="rk-h">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rk-h" className="text-base">Ranking in {year}{mineral !== "all" ? ` · ${mineral.replace(/_/g, " ")}` : ""}</h2>
          <span className="text-[11px] text-ink-3">{mode === "both" ? "net lean, China minus United States" : `${mode === "US" ? "United States" : "China"} index, 0–100`}{indexLayer === "real" ? " · computed" : " · sample"}</span>
        </div>
        {ranked.length === 0 ? (
          <p className="text-sm text-ink-3">No index for this selection.</p>
        ) : (
          <ol className="text-sm">
            {ranked.map((r, i) => {
              const w = Math.round((Math.abs(r.v) / maxAbs) * 100);
              const color = mode === "both" ? (r.v >= 0 ? "var(--cn)" : "var(--us)") : mode === "US" ? "var(--us)" : "var(--cn)";
              const picked = selection.includes(r.iso);
              return (
                <li key={r.iso}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.iso)}
                    onMouseEnter={() => onHover(r.iso)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(r.iso)}
                    onBlur={() => onHover(null)}
                    className={`grid w-full grid-cols-[1.5rem_8rem_1fr_3rem] items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2 ${hover === r.iso ? "bg-surface-2" : ""} ${picked ? "font-semibold ring-1 ring-outline" : ""}`}
                    aria-pressed={picked}
                  >
                    <span className="tabular-nums text-ink-3">{i + 1}.</span>
                    <span className="truncate">{r.name}</span>
                    <span className="h-2.5 overflow-hidden rounded-full border border-outline/40 bg-surface-2" aria-hidden="true"><span className="block h-full" style={{ width: `${w}%`, background: color }} /></span>
                    <span className="text-right tabular-nums text-ink-2">{mode === "both" ? fmtSigned(r.v, 0) : r.v.toFixed(0)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {ranked.length > 0 && ranked.length < 12 && <p className="mt-1 text-[11px] text-ink-3">{12 - ranked.length} of 12 countries have no index for this selection (no trade in the mineral, or fewer than three components).</p>}
      </section>
      {view !== "index" && (
        <section aria-labelledby="fl-h">
          <h2 id="fl-h" className="text-base">{view === "money" ? "Money flows" : "Trade flows"} on the map</h2>
          <p className="mt-0.5 text-[11px] text-ink-3">{aggs.length} arcs drawn. Every arc&apos;s numbers and sources are in the table; hover an arc for the same.</p>
          {view === "money" && window && flowsLastYear && (
            <>
              {flowsLastYear.finance_CN !== null && window[0] > flowsLastYear.finance_CN && <p className="mt-1 rounded-md border border-sample/40 bg-sample/10 px-2 py-1 text-[11px] text-sample">No Chinese finance data in {window[0] === window[1] ? String(window[0]) : `${window[0]}–${window[1]}`}: the AidData series ends in {flowsLastYear.finance_CN}. Move the year to {flowsLastYear.finance_CN} or widen the window.</p>}
              {flowsLastYear.finance_US !== null && window[0] > flowsLastYear.finance_US && <p className="mt-1 rounded-md border border-sample/40 bg-sample/10 px-2 py-1 text-[11px] text-sample">No US finance data in this window: the DFC series ends in {flowsLastYear.finance_US}.</p>}
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
