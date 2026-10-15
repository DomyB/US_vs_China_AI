"use client";

import { useEffect, useRef } from "react";
import type { FlowSpan } from "@/components/map/flows";
import { Icon } from "@/components/ui/Icons";
import { YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { INDEX_FORMULA, INDEX_LABEL, type IndexName } from "@/lib/indexView";
import type { ActorMode, CountryMeta, MineralMeta } from "@/lib/types";

/** The map's views: the index, the bivariate "who buys", and the two arc layers. */
export type MapView = "index" | "buyers" | "money" | "trade";
export const MAP_VIEWS: MapView[] = ["index", "buyers", "money", "trade"];
export const VIEW_LABEL: Record<MapView, string> = { index: "Influence index", buyers: "Who buys", money: "Money flows", trade: "Trade flows" };
const VIEW_TITLE: Record<MapView, string> = {
  index: "Colour each country by the composite influence index or one of its sub-indices (model output)",
  buyers: "Colour each country by China's and the US's shares of its own reported mineral exports (facts, UN Comtrade)",
  money: "Arcs: documented finance commitments from each actor",
  trade: "Arcs: reported mineral exports to each actor",
};
const SPAN_LABEL: Record<FlowSpan, string> = { "1": "This year", "3": "3 years", all: `Since ${YEAR_MIN}` };
const PARTNER_LABEL: Record<ActorMode, string> = { both: "China vs US", CN: "China only", US: "US only" };

interface Props {
  year: number;
  /** the year the page opens on (the latest year most countries are indexed in) */
  defaultYear: number;
  onYear: (y: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  /** the open country (null for the whole region) */
  country: string | null;
  countries: CountryMeta[];
  onCountry: (iso: string | null) => void;
  selectionCount: number;
  mineral: string;
  minerals: MineralMeta[];
  onMineral: (m: string) => void;
  mode: ActorMode;
  onMode: (m: ActorMode) => void;
  view: MapView;
  onView: (v: MapView) => void;
  span: FlowSpan;
  onSpan: (s: FlowSpan) => void;
  indexName: IndexName;
  onIndex: (n: IndexName) => void;
  /** whether the loaded file carries sub-index rows (the index menu is hidden otherwise) */
  indexSwitch: boolean;
  compareMode: boolean;
  onCompareMode: (on: boolean) => void;
  onReset: () => void;
  /** what the map draws, in one line ("net lean of the composite index, computed") */
  showing: string;
}

/**
 * The prototype's context bar on the explore page: period, countries, resource, partner and view as plain menus in one
 * band above the map, with the sentence that says what is shown and a reset. The URL carries every choice.
 */
export function ContextBar(p: Props) {
  const years = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
  const core = p.minerals.filter((m) => m.core);
  const extended = p.minerals.filter((m) => !m.core);
  const sorted = [...p.countries].filter((c) => c.in_scope).sort((a, b) => a.name.localeCompare(b.name));
  const mineralName = p.mineral === "all" ? "All minerals" : p.minerals.find((m) => m.id === p.mineral)?.name ?? p.mineral;
  const countryName = p.selectionCount >= 2 ? `${p.selectionCount} countries compared` : p.country ? sorted.find((c) => c.iso3 === p.country)?.name ?? p.country : `All ${sorted.length} countries`;
  const isDefault = p.year === p.defaultYear && !p.country && p.selectionCount === 0 && p.mineral === "all" && p.mode === "both" && p.view === "index" && p.span === "1" && p.indexName === "composite" && !p.compareMode;
  useAutoplay(p.year, p.playing, p.onYear, p.onTogglePlay);

  return (
    <div className="ctx-bar" data-tour="dock" role="region" aria-label="Context: period, countries, resource, partner and view">
      <span className="ctx-label">Context</span>
      <label className="ctx-field">
        <span>Period</span>
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (!p.playing && p.year >= YEAR_MAX) p.onYear(YEAR_MIN);
              p.onTogglePlay();
            }}
            aria-pressed={p.playing}
            aria-label={p.playing ? "Pause animation over years" : "Play animation over years"}
            title={p.playing ? "Pause" : `Play from ${p.year >= YEAR_MAX ? YEAR_MIN : p.year} to ${YEAR_MAX}`}
            className="btn btn-sm btn-icon shrink-0"
          >
            <Icon name={p.playing ? "pause" : "play"} size={13} />
          </button>
          <select id="ctx-year" aria-label="Year" value={p.year} onChange={(e) => p.onYear(Number(e.target.value))} className="input ctx-select">
            {years.map((y) => (
              <option key={y} value={y}>{y}{y === YEAR_MAX ? " (partial)" : ""}</option>
            ))}
          </select>
        </span>
      </label>
      <label className="ctx-field">
        <span>Countries</span>
        <select id="ctx-country" aria-label="Country" value={p.selectionCount >= 2 ? "compare" : p.country ?? "all"} onChange={(e) => p.onCountry(e.target.value === "all" || e.target.value === "compare" ? null : e.target.value)} className="input ctx-select">
          <option value="all">All {sorted.length} countries</option>
          {p.selectionCount >= 2 && <option value="compare">{p.selectionCount} countries compared</option>}
          <optgroup label="Open one country">
            {sorted.map((c) => (
              <option key={c.iso3} value={c.iso3}>{c.name}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="ctx-field">
        <span>Resource</span>
        <select id="ctx-mineral" aria-label="Mineral" value={p.mineral} onChange={(e) => p.onMineral(e.target.value)} className="input ctx-select">
          <option value="all">All minerals</option>
          <optgroup label="Core list">
            {core.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </optgroup>
          {extended.length > 0 && (
            <optgroup label="Extended list (no index yet)">
              {extended.map((m) => (
                <option key={m.id} value={m.id} disabled>{m.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label className="ctx-field">
        <span>Partner</span>
        <select id="ctx-partner" aria-label="Partner" value={p.mode} onChange={(e) => p.onMode(e.target.value as ActorMode)} className="input ctx-select">
          {(["both", "CN", "US"] as ActorMode[]).map((m) => (
            <option key={m} value={m}>{PARTNER_LABEL[m]}</option>
          ))}
        </select>
      </label>
      <label className="ctx-field">
        <span>View</span>
        <select id="ctx-view" aria-label="Map view" value={p.view} onChange={(e) => p.onView(e.target.value as MapView)} className="input ctx-select" title={VIEW_TITLE[p.view]}>
          {MAP_VIEWS.map((v) => (
            <option key={v} value={v} title={VIEW_TITLE[v]}>{VIEW_LABEL[v]}</option>
          ))}
        </select>
      </label>
      {p.view === "index" && p.indexSwitch && (
        <label className="ctx-field">
          <span>Index</span>
          <select id="ctx-index" aria-label="Index" value={p.indexName} onChange={(e) => p.onIndex(e.target.value as IndexName)} className="input ctx-select" title={INDEX_FORMULA[p.indexName]}>
            {(["composite", "economic_ties", "political_alignment"] as IndexName[]).map((n) => (
              <option key={n} value={n} title={INDEX_FORMULA[n]}>{INDEX_LABEL[n]}</option>
            ))}
          </select>
        </label>
      )}
      {(p.view === "money" || p.view === "trade") && (
        <label className="ctx-field">
          <span>Window</span>
          <select id="ctx-span" aria-label="Window" value={p.span} onChange={(e) => p.onSpan(e.target.value as FlowSpan)} className="input ctx-select">
            {(["1", "3", "all"] as FlowSpan[]).map((s) => (
              <option key={s} value={s}>{SPAN_LABEL[s]}</option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="btn btn-sm shrink-0" aria-pressed={p.compareMode} onClick={() => p.onCompareMode(!p.compareMode)} title="Pick up to four countries on the map or in the ranking to compare them">
        Compare{p.selectionCount > 1 ? ` · ${p.selectionCount}` : ""}
      </button>
      <div className="ctx-sentence">
        <span>
          Showing <b>{mineralName}</b> · <b>{countryName}</b> · <b>{PARTNER_LABEL[p.mode]}</b> · <b>{p.view === "money" || p.view === "trade" ? windowLabel(p.year, p.span) : p.year}</b> · {p.showing}
        </span>
        {!isDefault && (
          <button type="button" className="linkish" onClick={p.onReset}>Reset</button>
        )}
      </div>
    </div>
  );
}

function windowLabel(year: number, span: FlowSpan): string {
  if (span === "1") return String(year);
  if (span === "3") return `${Math.max(YEAR_MIN, year - 2)}–${year}`;
  return `${YEAR_MIN}–${year}`;
}

/** The play button's clock: one year every 900 ms, stopping at the last year. */
function useAutoplay(year: number, playing: boolean, onYear: (y: number) => void, onTogglePlay: () => void) {
  const ref = useRef(year);
  ref.current = year;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = ref.current + 1;
      if (next > YEAR_MAX) {
        onTogglePlay();
        return;
      }
      onYear(next);
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, onYear, onTogglePlay]);
}
