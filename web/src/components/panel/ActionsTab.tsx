"use client";

import * as Plot from "@observablehq/plot";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { SourceLink } from "@/components/ui/SourceLink";
import { Reading } from "@/components/ui/Reading";
import { SectionHeader } from "@/components/ui/Section";
import { ACTOR_COLOR, OTHER_COLOR, YEAR_MAX, YEAR_MIN, prettyLabel, prettyMineral } from "@/lib/constants";
import { tradeByYear, type TradeYearRow } from "@/lib/data";
import { fmtDate, fmtMusd } from "@/lib/format";
import { provenanceFor, type Provenance } from "@/lib/provenance";
import type { CountryData } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useRealMeta } from "@/lib/useRealMeta";

const PARTNER: Record<string, string> = { US: "to the United States", CN: "to China", ROW: "to the rest of the world" };
/** axis ticks in US$ bn from a thousand million up, so "60,000" never runs past the left margin */
const compactMusd = (v: number) => (v === 0 ? "0" : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 || Number.isInteger(v / 1000) ? 0 : 1)} bn` : `${v.toFixed(0)} m`);
/** every year of the record, so a year without trade rows is an empty slot on the band axis and every tick exists */
const ALL_YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
/** " (2 of 13 mineral rows with no partner row)" on a partial sum; "" when every row had a cell */
const absentNote = (d: TradeYearRow) => (d.absent > 0 ? ` (${d.absent} of ${d.n} mineral row${d.n === 1 ? "" : "s"} with no partner row)` : "");
const printMusd = (v: unknown) => (v === null || v === undefined ? "— (no partner row)" : fmtMusd(v as number));

export function ActionsTab({ data, year, mineral, sourceNames }: { data: CountryData; year: number; mineral: string; sourceNames?: Record<string, { name: string; url: string }> }) {
  const isReal = data.layers?.actions === "real";
  const meta = useRealMeta();
  const narrow = useMediaQuery("(max-width: 479px)");
  // one value per year and partner; an absent partner cell is left out of the sum and counted, never read as 0
  const trade = useMemo(() => tradeByYear(data.actions.trade, mineral), [data, mineral]);
  const hasMirror = useMemo(() => trade.some((t) => t.kind === "mirror"), [trade]);
  const absentYears = useMemo(() => trade.filter((t) => t.kind === "reported" && t.value === null).length, [trade]);
  const tradeSource = useMemo(() => data.actions.trade.find((t) => t.source)?.source ?? null, [data]);
  // the findings under the chart: the selected year's reported bars (or the mirror bars alone where the reporter has no
  // valued row that year), the tallest reported bar and how often China's is the tallest
  const tradeFindings = useMemo(() => {
    const reported = trade.filter((t) => t.kind === "reported");
    const inYear = reported.filter((t) => t.year === year);
    const mirrorInYear = trade.filter((t) => t.kind === "mirror" && t.year === year && t.value !== null).length;
    const valuedInYear = inYear.filter((t) => t.value !== null).length;
    const say = (p: TradeYearRow["partner"]) => {
      const r = inYear.find((t) => t.partner === p);
      return r && r.value !== null ? `${fmtMusd(r.value)} ${PARTNER[p]}` : `no row ${PARTNER[p]}`;
    };
    const valued = reported.filter((t): t is TradeYearRow & { value: number } => t.value !== null);
    const peak = valued.reduce<(TradeYearRow & { value: number }) | null>((best, t) => (best === null || t.value > best.value ? t : best), null);
    const years = Array.from(new Set(valued.map((t) => t.year)));
    const cnTop = years.filter((y) => {
      const rows = valued.filter((t) => t.year === y);
      const cn = rows.find((t) => t.partner === "CN");
      return cn !== undefined && rows.every((t) => t.partner === "CN" || t.value < cn.value);
    }).length;
    return { reported: reported.length, inYear: inYear.length, mirrorInYear, valuedInYear, say, peak, years: years.length, cnTop };
  }, [trade, year]);

  const tradeOptions = useMemo(
    () => ({
      height: 260,
      marginLeft: 56,
      // a fixed band domain: absent years render as gaps, and the ticks (every three years, every six on a phone) always exist
      x: { label: null, domain: ALL_YEARS, ticks: ALL_YEARS.filter((y) => (y - YEAR_MIN) % (narrow ? 6 : 3) === 0), tickFormat: (d: number) => String(d) },
      y: { label: isReal ? "Exports, US$" : "Exports, US$ (SAMPLE)", grid: true, tickFormat: compactMusd },
      color: { domain: ["US", "CN", "ROW"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN, OTHER_COLOR], legend: true, tickFormat: (d: string) => ({ US: "to United States", CN: "to China", ROW: "to rest of world" }[d] ?? d) },
      marks: [
        Plot.barY(trade.filter((t) => t.kind === "reported" && t.value !== null), { x: "year", y: "value", fill: "partner", insetLeft: 1, insetRight: hasMirror ? 8 : 1, tip: true, order: ["US", "CN", "ROW"], title: (d: TradeYearRow) => `${d.year} · ${PARTNER[d.partner] ?? d.partner}: ${fmtMusd(d.value)}${absentNote(d)}` }),
        ...(hasMirror
          ? [Plot.barY(trade.filter((t) => t.kind === "mirror" && t.value !== null), { x: "year", y: "value", fill: "partner", fillOpacity: 0.45, insetLeft: 14, insetRight: 1, tip: true, order: ["US", "CN"], title: (d: TradeYearRow) => `${d.year} · mirror (partner-reported) ${PARTNER[d.partner] ?? d.partner}: ${fmtMusd(d.value)}${absentNote(d)}` })]
          : []),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
        Plot.ruleY([0]),
      ],
    }),
    [trade, year, hasMirror, isReal, narrow],
  );

  // the cadastre titles the export counts for the country (meta.coverage) with the run that read them; the titles
  // themselves are not yet exported, so this is the count with its source and date, nothing more
  const concessions = useMemo(() => {
    const n = meta?.coverage?.[data.iso3]?.concessions ?? 0;
    if (!meta || n <= 0) return null;
    const sourceId = `${data.iso3.toLowerCase()}_cadastre`;
    const run = meta.ingest_runs.find((r) => r.source_id === sourceId);
    const retrieved = run?.finished_at ? run.finished_at.slice(0, 10) : null;
    const provenance: Provenance = {
      title: `Mining titles in the national cadastre, ${data.name}`,
      layer: "facts",
      tables: ["concession"],
      ids: [`concession:${data.iso3}`],
      sources: [sourceId],
      status: "count only: the titles (holder, mineral, status, area, grant date) are in the warehouse and not yet exported to the site",
      glossary: ["reliability_rating"],
    };
    return { n, sourceId, retrieved, provenance, source: sourceNames?.[sourceId] ?? null };
  }, [meta, data, sourceNames]);

  const [allYears, setAllYears] = useState(false);
  const [eventsShown, setEventsShown] = useState(30);
  const allEvents = useMemo(() => data.actions.events.filter((e) => mineral === "all" || e.mineral === mineral), [data, mineral]);
  const events = useMemo(() => allEvents.filter((e) => allYears || e.year === year).sort((a, b) => (allYears ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))), [allEvents, year, allYears]);
  useEffect(() => setEventsShown(30), [year, mineral, allYears, data]);
  // the findings under the timeline: the circles by side, the published amounts and the records in the selected year
  const eventFindings = useMemo(() => {
    const side = (s: "US" | "CN" | "other") => allEvents.filter((e) => e.actor_side === s).length;
    const priced = allEvents.filter((e) => e.amount_musd !== null && e.amount_musd > 0);
    const largest = priced.reduce<(typeof priced)[number] | null>((best, e) => (best === null || (e.amount_musd ?? 0) > (best.amount_musd ?? 0) ? e : best), null);
    return { cn: side("CN"), us: side("US"), other: side("other"), priced: priced.length, largest, inYear: allEvents.filter((e) => e.year === year).length };
  }, [allEvents, year]);
  const timelineOptions = useMemo(() => {
    const rows = allEvents.map((e) => ({ ...e, when: new Date(e.date.length === 4 ? `${e.date}-07-01` : e.date), side: e.actor_side === "US" ? "US-linked" : e.actor_side === "CN" ? "China-linked" : "Other", amt: e.amount_musd ?? 0 }));
    const years = allEvents.map((e) => e.year);
    const lo = Math.min(YEAR_MIN, ...years);
    const hi = Math.max(YEAR_MAX, ...years);
    return {
      height: 150,
      marginLeft: 92,
      x: { type: "utc" as const, label: null, domain: [new Date(`${lo}-01-01`), new Date(`${hi}-12-31`)] },
      y: { label: null, domain: ["US-linked", "China-linked", "Other"] },
      r: { range: [2.5, 14] },
      color: { domain: ["US-linked", "China-linked", "Other"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN, OTHER_COLOR] },
      marks: [
        Plot.rectX([{ a: new Date(`${year}-01-01`), b: new Date(`${year}-12-31`) }], { x1: "a", x2: "b", fill: "#1b1d20", fillOpacity: 0.06 }),
        Plot.dot(rows.filter((d) => d.amt > 0), { x: "when", y: "side", r: "amt", fill: "side", fillOpacity: 0.55, stroke: "#fff", strokeWidth: 0.5, tip: true, title: (d: (typeof rows)[number]) => `${fmtDate(d.date)} · ${prettyLabel(d.type)}${d.mineral && d.mineral !== "none" ? ` · ${prettyMineral(d.mineral)}` : ""}\n${fmtMusd(d.amount_musd)} · ${d.actors.slice(0, 2).join(" → ")}\n${d.description.slice(0, 140)}${d.description.length > 140 ? "…" : ""}` }),
        Plot.dot(rows.filter((d) => d.amt <= 0), { x: "when", y: "side", r: 2.5, fill: "none", stroke: "side", strokeWidth: 1.2, tip: true, title: (d: (typeof rows)[number]) => `${fmtDate(d.date)} · ${prettyLabel(d.type)} · no published amount\n${d.description.slice(0, 140)}${d.description.length > 140 ? "…" : ""}` }),
      ],
    };
  }, [allEvents, year]);
  const [contractQuery, setContractQuery] = useState("");
  const contracts = useMemo(() => {
    const needle = contractQuery.trim().toLowerCase();
    return (data.actions.contracts ?? []).filter((c) => mineral === "all" || c.mineral === mineral).filter((c) => !needle || `${c.title} ${c.companies ?? ""} ${c.resource ?? ""}`.toLowerCase().includes(needle));
  }, [data, mineral, contractQuery]);
  const production = useMemo(() => (data.actions.production ?? []).filter((p) => (mineral === "all" || p.mineral === mineral) && p.year === year), [data, mineral, year]);
  // one line per mineral and measure; the other series (other sources, other units) sit behind a toggle
  const productionGroups = useMemo(() => {
    const groups = new Map<string, typeof production>();
    for (const p of production) {
      const k = `${p.mineral}|${p.measure}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    return Array.from(groups.entries()).map(([k, rows]) => ({ key: k, mineral: rows[0].mineral, measure: rows[0].measure, rows })).sort((a, b) => a.mineral.localeCompare(b.mineral) || a.measure.localeCompare(b.measure));
  }, [production]);
  // the findings under the table: the series by measure, the shown rows with no quantity and those with other series behind the toggle
  const productionFindings = useMemo(
    () => ({
      prod: productionGroups.filter((g) => g.measure === "production").length,
      res: productionGroups.filter((g) => g.measure === "reserves").length,
      dashes: productionGroups.filter((g) => g.rows[0].qty == null).length,
      multi: productionGroups.filter((g) => g.rows.length > 1).length,
    }),
    [productionGroups],
  );
  const investment = useMemo(() => (data.actions.investment ?? []).filter((r) => r.direction === "inward"), [data]);
  const investmentYears = useMemo(() => Array.from(new Set(investment.map((r) => r.year))).sort((a, b) => a - b).slice(-6), [investment]);
  const investmentSeries = useMemo(() => {
    const by = new Map<string, { counterpart: string; basis: string; byYear: Record<number, number> }>();
    for (const r of investment) {
      const k = `${r.counterpart}|${r.basis}`;
      const row = by.get(k) ?? { counterpart: r.counterpart, basis: r.basis, byYear: {} };
      row.byYear[r.year] = r.musd;
      by.set(k, row);
    }
    return Array.from(by.values()).sort((a, b) => a.counterpart.localeCompare(b.counterpart) || a.basis.localeCompare(b.basis));
  }, [investment]);
  const investmentLatest = useMemo(() => investmentSeries.filter((r) => r.basis === "reported").map((r) => { const ys = Object.keys(r.byYear).map(Number); const y = Math.max(...ys); return { counterpart: r.counterpart, year: y, musd: r.byYear[y] }; }), [investmentSeries]);
  // the findings under the table: its span, the largest of the latest reported stocks within the columns shown (a row whose
  // record ends before them has no figure on screen) and the cells the surveys do not carry
  const investmentFindings = useMemo(() => {
    const cells = investmentSeries.length * investmentYears.length;
    const blank = investmentSeries.reduce((n, r) => n + investmentYears.filter((y) => r.byYear[y] == null).length, 0);
    const top = investmentSeries
      .filter((r) => r.basis === "reported")
      .reduce<{ counterpart: string; year: number; musd: number } | null>((best, r) => {
        const ys = investmentYears.filter((y) => r.byYear[y] != null);
        if (ys.length === 0) return best;
        const y = ys[ys.length - 1];
        return best === null || r.byYear[y] > best.musd ? { counterpart: r.counterpart, year: y, musd: r.byYear[y] } : best;
      }, null);
    return { cells, blank, top };
  }, [investmentSeries, investmentYears]);
  const [contractsShown, setContractsShown] = useState(20);
  const COUNTERPART_NAME: Record<string, string> = { CHN: "China", USA: "United States", HKG: "Hong Kong SAR" };
  const sideColor = { US: "var(--us)", CN: "var(--cn)", other: "var(--other)" } as const;

  return (
    <div className="space-y-5">
      <section aria-labelledby="trade-h">
        <SectionHeader
          id="trade-h"
          title="Mineral exports by destination"
          tags={<><DataLayerTag layer={data.layers?.actions} /><LayerLabel layer="facts" /></>}
          provenance={provenanceFor("trade", { iso3: data.iso3, year, meta, title: `Mineral exports by destination, ${data.name}` })}
          asks={`Does ${data.name}'s ore go to China, to the United States or elsewhere, and has that changed year by year? Bars in US dollars keep the three destinations on one scale.`}
          how={`One bar per year and buyer, the rest of the world in grey${hasMirror ? "; a lighter narrow bar beside it is the partner's own report of the same flow" : ""}; the dashed rule is the selected year; a missing bar is a year Comtrade returned no partner row for, never zero, and a gap on the axis is a year with no trade row at all.`}
        />
        <p className="mb-2 text-xs text-ink-3">
          {mineral === "all" ? "All core minerals" : prettyMineral(mineral)}, annual, reported by {data.name}.
          {hasMirror ? " Mirror data (partner-reported) includes freight and insurance." : " Mirror data appears here once the partner-reported series is ingested."}
          {trade.length > 0 && absentYears > 0 && ` ${absentYears} partner-year${absentYears === 1 ? "" : "s"} here ${absentYears === 1 ? "has" : "have"} no Comtrade partner row.`}
        </p>
        {trade.length === 0 ? (
          <p className="text-sm text-ink-3">No trade rows for this selection. Missing means not reported, not zero.</p>
        ) : (
          <>
            <PlotFigure options={tradeOptions} ariaLabel={`Exports of ${mineral === "all" ? "core minerals" : prettyMineral(mineral)} from ${data.name} by destination, ${YEAR_MIN} to ${YEAR_MAX}${isReal ? "" : ", sample data"}`} />
            <DataTable rows={trade} caption="Exports by destination (a dash: no partner row, never zero; the last column counts the mineral rows with no partner row out of those summed)" columns={[{ key: "year", label: "Year" }, { key: "partner", label: "Destination" }, { key: "kind", label: "Reported by" }, { key: "value", label: "US$ m", format: printMusd }, { key: "absent", label: "No partner row", format: (v) => (Number(v) > 0 ? String(v) : "") }]} />
            <Reading
              findings={[
                tradeFindings.inYear === 0
                  ? `No trade row for ${year}: the band axis leaves a gap there`
                  : tradeFindings.valuedInYear === 0 && tradeFindings.mirrorInYear > 0
                    ? `No reported partner row for ${year}: only the ${tradeFindings.mirrorInYear} mirror bar${tradeFindings.mirrorInYear === 1 ? " is" : "s are"} drawn there`
                    : `Reported in ${year}: ${tradeFindings.say("CN")}, ${tradeFindings.say("US")}, ${tradeFindings.say("ROW")}`,
                tradeFindings.peak ? `The tallest reported bar is ${fmtMusd(tradeFindings.peak.value)} ${PARTNER[tradeFindings.peak.partner]} in ${tradeFindings.peak.year}` : null,
                tradeFindings.years > 0 ? `China's bar is the tallest in ${tradeFindings.cnTop} of the ${tradeFindings.years} years with a reported value` : `None of the ${tradeFindings.reported} reported rows carries a value: no reported bar is drawn`,
              ]}
              says="Read the later years against the earlier ones: the colour that has grown is the buyer that has gained. Where a mirror bar is drawn, its distance from the reported bar is how far the two customs records disagree."
              compact
            />
          </>
        )}
        {tradeSource && (
          <div className="mt-1">
            <SourceLink source={tradeSource} />
          </div>
        )}
        {data.trade_discrepancies && data.trade_discrepancies.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-ink-3 hover:text-ink-2">{data.trade_discrepancies.length} flagged discrepancies between reported and mirror data</summary>
            <ul className="mt-1 space-y-0.5 text-ink-2">
              {data.trade_discrepancies.slice(0, 30).map((d, i) => (
                <li key={i}>
                  {d.year} · {prettyMineral(d.mineral)} (HS {d.hs6}) to {d.partner}: reported {fmtMusd(d.reported_usd != null ? d.reported_usd / 1e6 : null)}, mirror {fmtMusd(d.mirror_usd != null ? d.mirror_usd / 1e6 : null)} · {prettyLabel(d.flag)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="events-h">
        <SectionHeader
          id="events-h"
          title={allYears ? "Deals, loans, investments and agreements, all years" : `Deals, loans, investments and agreements in ${year}`}
          tags={<><DataLayerTag layer={data.layers?.actions} /><LayerLabel layer="facts" /></>}
          provenance={provenanceFor("finance", { iso3: data.iso3, year: allYears ? undefined : year, meta, title: `Finance events, ${data.name}` })}
          asks="When did money and agreements arrive, from which side, and how large were they? A timeline by actor side shows the clustering in time that a list sorted by date hides."
          how={`One circle per recorded event, placed by date on the row of its side and sized by the published amount, hollow when no amount was published; the shaded band is ${year}; the list beneath is the same records in full.`}
        />
        {allEvents.length > 0 && (
          <>
            <p className="mb-1 text-xs text-ink-3">Every recorded event. Hover a circle for the record.</p>
            <PlotFigure options={timelineOptions} ariaLabel={`Timeline of ${allEvents.length} recorded deals, loans, investments and agreements in ${data.name} by actor side, circle size by amount`} />
            <Reading
              findings={[
                `${allEvents.length} circle${allEvents.length === 1 ? "" : "s"}: ${eventFindings.cn} China-linked, ${eventFindings.us} US-linked and ${eventFindings.other} other`,
                eventFindings.largest ? `${eventFindings.priced} carr${eventFindings.priced === 1 ? "ies" : "y"} a published amount; the largest is ${fmtMusd(eventFindings.largest.amount_musd)} in ${eventFindings.largest.year}` : `None of the ${allEvents.length} carries a published amount: every circle is hollow`,
                eventFindings.inYear > 0 ? `${eventFindings.inYear} of them fall${eventFindings.inYear === 1 ? "s" : ""} in ${year}, the shaded band` : `None falls in ${year}, the shaded band`,
              ]}
              says="An empty row is a side with no record in the dataset, not a side that did nothing: the records come from published sources, and a quiet stretch may be an unreported one."
              compact
            />
          </>
        )}
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1 text-ink-2"><input type="checkbox" checked={allYears} onChange={(e) => setAllYears(e.target.checked)} /> all years</label>
          <span className="ml-auto text-ink-3">{events.length} of {allEvents.length} event{allEvents.length === 1 ? "" : "s"}</span>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-ink-3">No recorded events for this selection. Absence of a record is not evidence of absence.</p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {events.slice(0, eventsShown).map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs tabular-nums text-ink-3">{fmtDate(e.date)}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: sideColor[e.actor_side] }}>
                    <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: sideColor[e.actor_side] }} />
                    {e.actor_side === "other" ? "Other actor" : e.actor_side === "US" ? "US-linked" : "China-linked"}
                  </span>
                  <span className="text-xs text-ink-2">{prettyLabel(e.type)}{e.mineral && e.mineral !== "none" ? ` · ${prettyMineral(e.mineral)}` : ""}</span>
                  {e.amount_musd !== null && <span className="ml-auto text-xs tabular-nums">{fmtMusd(e.amount_musd)}</span>}
                </div>
                <p className="mt-0.5 text-ink-2">{e.description}</p>
                {e.actors.length > 0 && <p className="text-xs text-ink-3">{e.actors.join(" · ")}{e.sector ? ` · ${e.sector}` : ""}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <SourceLink source={e.source} compact />
                  {e.also_reported_by && e.also_reported_by.length > 0 && <span className="text-[10px] text-ink-3">also in: {e.also_reported_by.join(", ")}</span>}
                  <span className="text-[10px] uppercase tracking-wide text-ink-3">confidence: {prettyLabel(e.confidence)}{e.date_precision && e.date_precision !== "day" ? ` · date precision: ${e.date_precision}` : ""}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {events.length > eventsShown && (
          <button type="button" onClick={() => setEventsShown((n) => n + 30)} className="btn btn-sm mt-2">
            Show {Math.min(30, events.length - eventsShown)} more of {events.length - eventsShown} remaining
          </button>
        )}
      </section>

      {investment.length > 0 && (
        <section aria-labelledby="inv-h">
          <SectionHeader
            id="inv-h"
            title="Direct investment positions held by each actor"
            tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>}
            provenance={provenanceFor("investment", { iso3: data.iso3, year, meta })}
            intro={`Inward direct-investment stock of ${data.name} held by China, Hong Kong SAR and the United States, US$ million, as the IMF publishes it: the country's own survey ("reported") and the counterpart's report of the same stock ("derived") are two figures of one position and are never added. ${investmentLatest.length ? `Latest reported: ${investmentLatest.map((r) => `${COUNTERPART_NAME[r.counterpart] ?? r.counterpart} ${fmtMusd(r.musd)} (${r.year})`).join("; ")}.` : ""}`}
            asks={`How much of ${data.name}'s inward investment stock is held from China, Hong Kong and the United States, and whose record says so? A table of positions by year keeps the two reporters apart.`}
            how="One row per counterpart and basis, one column per year of the last six on record; a dash is a year the survey does not carry, not zero."
          />
          <table className="w-full text-xs">
            <thead><tr><th>Counterpart</th><th>Basis</th>{investmentYears.map((y) => <th key={y} className="text-right">{y}</th>)}</tr></thead>
            <tbody>
              {investmentSeries.map((row) => (
                <tr key={`${row.counterpart}-${row.basis}`}>
                  <td className="font-medium">{COUNTERPART_NAME[row.counterpart] ?? row.counterpart}</td>
                  <td>{row.basis}</td>
                  {investmentYears.map((y) => <td key={y} className="text-right tabular-nums">{row.byYear[y] == null ? "—" : fmtMusd(row.byYear[y])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <Reading
            findings={[
              investmentYears.length > 0 ? `${investmentSeries.length} row${investmentSeries.length === 1 ? "" : "s"} over ${investmentYears.length} year column${investmentYears.length === 1 ? "" : "s"}, ${investmentYears[0]}${investmentYears.length > 1 ? ` to ${investmentYears[investmentYears.length - 1]}` : ""}` : null,
              investmentFindings.top ? `The largest of the latest reported stocks in the columns shown is held by ${COUNTERPART_NAME[investmentFindings.top.counterpart] ?? investmentFindings.top.counterpart}, ${fmtMusd(investmentFindings.top.musd)} in ${investmentFindings.top.year}` : `No reported row carries a figure in the ${investmentYears.length} column${investmentYears.length === 1 ? "" : "s"} shown`,
              investmentFindings.cells > 0 ? (investmentFindings.blank > 0 ? `${investmentFindings.blank} of the ${investmentFindings.cells} cells ${investmentFindings.blank === 1 ? "is a dash, a year" : "are dashes, years"} a survey does not carry` : `All ${investmentFindings.cells} cells carry a figure`) : null,
            ]}
            says="Where the reported and derived rows of one counterpart differ, the two statistical offices see the same position differently; the table shows both and does not choose between them."
            saysKind="facts"
            compact
          />
          <p className="mt-1 text-[11px] text-ink-3">Source: <SourceLink source={investment[0].source} compact />.</p>
        </section>
      )}
      {production.length > 0 && (
        <section aria-labelledby="prod-h">
          <SectionHeader
            id="prod-h"
            title={`Production and reserves in ${year}`}
            tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>}
            provenance={provenanceFor("production", { iso3: data.iso3, year, meta })}
            intro={`${productionGroups.length} mineral series; where several sources or units report the same mineral, the first row is shown and the others open on request.`}
            asks={`What does ${data.name} dig up, and what does it still hold in the ground, in ${year}? A table, because quantities in different units cannot share one axis.`}
            how="One row per mineral and measure (production or reserves) with its unit and source; a dash is a quantity the source does not give, not zero; other series for the same mineral open under the source."
          />
          <table className="w-full text-xs">
            <thead><tr><th>Mineral</th><th>Measure</th><th className="text-right">Quantity</th><th>Unit</th><th className="hidden sm:table-cell">Source</th></tr></thead>
            <tbody>
              {productionGroups.map((g) => {
                const source = (
                  <>
                    <SourceLink source={g.rows[0].source} compact />
                    {g.rows.length > 1 && (
                      <details className="mt-0.5">
                        <summary>{g.rows.length - 1} other series</summary>
                        <ul className="mt-0.5 space-y-0.5 text-[11px] text-ink-2">
                          {g.rows.slice(1).map((p, i) => (
                            <li key={i}><span className="tabular-nums">{p.qty == null ? "—" : p.qty.toLocaleString("en-GB")}</span> {p.unit} · <SourceLink source={p.source} compact /></li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                );
                return (
                  <Fragment key={g.key}>
                    <tr className="align-top">
                      <td className="font-medium">{prettyMineral(g.mineral)}</td>
                      <td>{g.measure}</td>
                      <td className="text-right tabular-nums">{g.rows[0].qty == null ? "—" : g.rows[0].qty.toLocaleString("en-GB")}</td>
                      <td>{g.rows[0].unit}</td>
                      <td className="hidden sm:table-cell">{source}</td>
                    </tr>
                    {/* under sm the source takes a line of its own beneath the mineral: in a fifth column it wrapped one word per line */}
                    <tr className="sm:hidden"><td colSpan={4} className="border-t-0 pt-0">{source}</td></tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <Reading
            findings={[
              `${productionGroups.length} series for ${year}: ${productionFindings.prod} production and ${productionFindings.res} reserves row${productionFindings.res === 1 ? "" : "s"}`,
              productionFindings.dashes > 0 ? `${productionFindings.dashes} of the ${productionGroups.length} shown rows ${productionFindings.dashes === 1 ? "is a dash, a quantity" : "are dashes, quantities"} the source does not give` : `Every one of the ${productionGroups.length} shown rows carries a quantity`,
              productionFindings.multi > 0 ? `${productionFindings.multi} of the ${productionGroups.length} rows ${productionFindings.multi === 1 ? "has" : "have"} other series behind the toggle` : `None of the ${productionGroups.length} series has a second source or unit behind the toggle`,
            ]}
            says="Read the production row of a mineral against its reserves row for how long the known deposits would last at the current rate; the units differ by row, so check the unit column before comparing."
            compact
          />
        </section>
      )}

      {/* the technical detail of the tab: the cadastre count and the published contracts, folded at the end */}
      {(concessions || contracts.length > 0) && (
        <details className="tech-fold">
          <summary>Technical detail</summary>
          <div className="tech-fold-body space-y-5">
            {concessions && (
              <section aria-labelledby="conc-h">
                <SectionHeader id="conc-h" title="Mining titles in the national cadastre" tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>} provenance={concessions.provenance} />
                <p className="text-sm text-ink-2">
                  <span className="font-semibold tabular-nums">{concessions.n.toLocaleString("en-GB")}</span> titles in the cadastre
                  {concessions.retrieved ? `, retrieved ${fmtDate(concessions.retrieved)}` : ""}
                  {" · "}
                  <span className="text-xs text-ink-3">
                    Source: {concessions.source ? <a href={concessions.source.url} target="_blank" rel="noopener noreferrer" className="underline">{concessions.source.name}</a> : <a href={`/sources#${concessions.sourceId}`} className="underline">{concessions.sourceId}</a>}
                  </span>
                </p>
                <p className="text-xs text-ink-3">The count of titles the ingestion read; the titles themselves (holder, mineral, status, area, grant date) are not yet exported to the site.</p>
              </section>
            )}
            {contracts.length > 0 && (
              <section aria-labelledby="contracts-h">
                <SectionHeader id="contracts-h" title={`Published contracts (${contracts.length})`} tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>} provenance={provenanceFor("contracts", { iso3: data.iso3, meta })} intro="From the ResourceContracts database; the mineral and the companies are shown where the record carries them." />
                <input value={contractQuery} onChange={(e) => setContractQuery(e.target.value)} placeholder="Search contracts by title, company or resource…" aria-label="Search contracts" className="input mb-2 h-7 w-72 max-w-full py-0 text-xs" />
                <ul className="divide-y divide-rule border-y border-rule text-sm">
                  {contracts.slice(0, contractsShown).map((c) => (
                    <li key={c.id} className="py-1.5">
                      <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">{c.title}</a>
                      <p className="text-xs text-ink-3">{[c.year, c.resource, c.type, c.companies].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ul>
                {contracts.length > contractsShown && (
                  <button type="button" onClick={() => setContractsShown((n) => n + 40)} className="btn btn-sm mt-2">
                    Show more ({contracts.length - contractsShown} remaining)
                  </button>
                )}
              </section>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
