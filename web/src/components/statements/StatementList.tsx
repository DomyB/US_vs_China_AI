"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/charts/PlotFigure";
import { prettyLabel, prettyMineral } from "@/lib/constants";
import type { StatementRecord } from "@/lib/types";
import { EMPTY_FILTERS, STANCE_WORD, blocShort, facet, filterStatements, type StanceFilter, type StatementFilters } from "./blocs";
import { StatementCard } from "./StatementCard";

const PAGE = 15;

/** Filters, search, the paged list and a table alternative for a set of statements. */
export function StatementList({ records, year, showCountry = false, names }: { records: StatementRecord[]; year?: number; showCountry?: boolean; names?: Record<string, string> }) {
  const [f, setF] = useState<StatementFilters>(EMPTY_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const set = (patch: Partial<StatementFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const blocs = useMemo(() => facet(records, (r) => [r.speaker.bloc]), [records]);
  const minerals = useMemo(() => facet(records, (r) => r.minerals), [records]);
  const themes = useMemo(() => facet(records, (r) => r.themes), [records]);
  const channels = useMemo(() => facet(records, (r) => [r.channel]), [records]);
  const filtered = useMemo(() => filterStatements(records, f), [records, f]);
  useEffect(() => setShown(PAGE), [f, records]);
  const active = f.bloc || f.stance !== "any" || f.mineral || f.theme || f.channel || f.year !== null || f.q;
  const sel = "input h-7 py-0 text-xs";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search speaker, quote, summary…" aria-label="Search statements" className={`${sel} w-56`} />
        <select aria-label="Speaker bloc" value={f.bloc} onChange={(e) => set({ bloc: e.target.value })} className={sel}>
          <option value="">All speakers</option>
          {blocs.map((b) => <option key={b.value} value={b.value}>{blocShort(b.value)} ({b.n})</option>)}
        </select>
        <select aria-label="Stance filter" value={f.stance} onChange={(e) => set({ stance: e.target.value as StanceFilter })} className={sel}>
          <option value="any">Any stance</option>
          <option value="cn_any">Takes a position on China</option>
          <option value="cn_positive">Positive toward China</option>
          <option value="cn_negative">Negative toward China</option>
          <option value="us_any">Takes a position on the US</option>
          <option value="us_positive">Positive toward the US</option>
          <option value="us_negative">Negative toward the US</option>
        </select>
        <select aria-label="Mineral" value={f.mineral} onChange={(e) => set({ mineral: e.target.value })} className={sel}>
          <option value="">All minerals</option>
          {minerals.map((m) => <option key={m.value} value={m.value}>{prettyMineral(m.value)} ({m.n})</option>)}
        </select>
        <select aria-label="Theme" value={f.theme} onChange={(e) => set({ theme: e.target.value })} className={sel}>
          <option value="">All themes</option>
          {themes.map((t) => <option key={t.value} value={t.value}>{prettyLabel(t.value)} ({t.n})</option>)}
        </select>
        <select aria-label="Channel" value={f.channel} onChange={(e) => set({ channel: e.target.value })} className={sel}>
          <option value="">All channels</option>
          {channels.map((c) => <option key={c.value} value={c.value}>{prettyLabel(c.value)} ({c.n})</option>)}
        </select>
        {year !== undefined && (
          <label className="inline-flex items-center gap-1 text-ink-2"><input type="checkbox" checked={f.year === year} onChange={(e) => set({ year: e.target.checked ? year : null })} /> only {year}</label>
        )}
        {active && <button type="button" className="text-ink-3 underline decoration-dotted" onClick={() => setF(EMPTY_FILTERS)}>clear</button>}
        <span className="ml-auto text-ink-3">{filtered.length} of {records.length}</span>
      </div>
      {filtered.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">No statement matches these filters.</p>
      ) : (
        <ol className="mt-1 divide-y divide-rule border-y border-rule">
          {filtered.slice(0, shown).map((r) => <StatementCard key={r.id} r={r} showCountry={showCountry} names={names} />)}
        </ol>
      )}
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn mt-2 h-8 px-3 text-xs">
          Show {Math.min(PAGE, filtered.length - shown)} more of {filtered.length - shown} remaining
        </button>
      )}
      <DataTable
        rows={filtered.map((r) => ({ date: r.date_precision === "month" ? r.date.slice(0, 7) : r.date, speaker: r.speaker.name, bloc: blocShort(r.speaker.bloc), cn: STANCE_WORD[r.stance.cn], us: STANCE_WORD[r.stance.us], source: r.source.name, verification: r.source.verification }))}
        caption="Statements with the dataset's stance coding"
        columns={[{ key: "date", label: "Date" }, { key: "speaker", label: "Speaker" }, { key: "bloc", label: "Bloc" }, { key: "cn", label: "Toward China" }, { key: "us", label: "Toward US" }, { key: "source", label: "Source" }, { key: "verification", label: "Verification" }]}
      />
    </div>
  );
}
