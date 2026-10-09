"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { SourceLink } from "@/components/ui/SourceLink";
import { SectionHeader } from "@/components/ui/Section";
import { ACTOR_COLOR, OTHER_COLOR, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtDate, fmtMusd } from "@/lib/format";
import type { CountryData } from "@/lib/types";

export function ActionsTab({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const isReal = data.layers?.actions === "real";
  const trade = useMemo(() => {
    const rows = data.actions.trade.filter((t) => mineral === "all" || t.mineral === mineral);
    const byYear = new Map<number, { CN: number; US: number; ROW: number; mCN: number | null; mUS: number | null }>();
    for (const r of rows) {
      const cur = byYear.get(r.year) ?? { CN: 0, US: 0, ROW: 0, mCN: null, mUS: null };
      cur.CN += r.exports_musd.CN ?? 0;
      cur.US += r.exports_musd.US ?? 0;
      cur.ROW += r.exports_musd.ROW ?? 0;
      if (r.mirror_musd?.CN != null) cur.mCN = (cur.mCN ?? 0) + r.mirror_musd.CN;
      if (r.mirror_musd?.US != null) cur.mUS = (cur.mUS ?? 0) + r.mirror_musd.US;
      byYear.set(r.year, cur);
    }
    const long: { year: number; partner: string; value: number; kind: "reported" | "mirror" }[] = [];
    for (const [y, v] of byYear) {
      for (const p of ["CN", "US", "ROW"] as const) long.push({ year: y, partner: p, value: v[p], kind: "reported" });
      if (v.mCN != null) long.push({ year: y, partner: "CN", value: v.mCN, kind: "mirror" });
      if (v.mUS != null) long.push({ year: y, partner: "US", value: v.mUS, kind: "mirror" });
    }
    return long.sort((a, b) => a.year - b.year);
  }, [data, mineral]);
  const hasMirror = useMemo(() => trade.some((t) => t.kind === "mirror"), [trade]);
  const tradeSource = useMemo(() => data.actions.trade.find((t) => t.source)?.source ?? null, [data]);

  const tradeOptions = useMemo(
    () => ({
      height: 260,
      marginLeft: 48,
      x: { label: null, ticks: [2008, 2011, 2014, 2017, 2020, 2023, 2026], tickFormat: (d: number) => String(d) },
      y: { label: isReal ? "Exports, US$ m" : "Exports, US$ m (SAMPLE)", grid: true },
      color: { domain: ["US", "CN", "ROW"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN, OTHER_COLOR], legend: true, tickFormat: (d: string) => ({ US: "to United States", CN: "to China", ROW: "to rest of world" }[d] ?? d) },
      marks: [
        Plot.barY(trade.filter((t) => t.kind === "reported"), { x: "year", y: "value", fill: "partner", insetLeft: 1, insetRight: hasMirror ? 8 : 1, tip: true, order: ["US", "CN", "ROW"] }),
        ...(hasMirror
          ? [Plot.barY(trade.filter((t) => t.kind === "mirror"), { x: "year", y: "value", fill: "partner", fillOpacity: 0.45, insetLeft: 14, insetRight: 1, tip: true, order: ["US", "CN"], title: (d: { year: number; partner: string; value: number }) => `${d.year} mirror (partner-reported) to ${d.partner}: ${d.value.toFixed(1)} US$ m` })]
          : []),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
        Plot.ruleY([0]),
      ],
    }),
    [trade, year, hasMirror, isReal],
  );

  const [allYears, setAllYears] = useState(false);
  const [eventsShown, setEventsShown] = useState(30);
  const allEvents = useMemo(() => data.actions.events.filter((e) => mineral === "all" || e.mineral === mineral), [data, mineral]);
  const events = useMemo(() => allEvents.filter((e) => allYears || e.year === year).sort((a, b) => (allYears ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))), [allEvents, year, allYears]);
  useEffect(() => setEventsShown(30), [year, mineral, allYears, data]);
  const timelineOptions = useMemo(() => {
    const rows = allEvents.map((e) => ({ ...e, when: new Date(e.date.length === 4 ? `${e.date}-07-01` : e.date), side: e.actor_side === "US" ? "US-linked" : e.actor_side === "CN" ? "China-linked" : "Other", amt: e.amount_musd ?? 0 }));
    const years = allEvents.map((e) => e.year);
    const lo = Math.min(2008, ...years);
    const hi = Math.max(2026, ...years);
    return {
      height: 150,
      marginLeft: 84,
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
  const [contractsShown, setContractsShown] = useState(20);
  const sideColor = { US: "var(--us)", CN: "var(--cn)", other: "var(--other)" } as const;

  return (
    <div className="space-y-5">
      <section aria-labelledby="trade-h">
        <SectionHeader id="trade-h" title="Mineral exports by destination" tags={<><DataLayerTag layer={data.layers?.actions} /><LayerLabel layer="facts" /></>} />
        <p className="mb-2 text-xs text-ink-3">
          {mineral === "all" ? "All core minerals" : prettyMineral(mineral)}, annual, reported by {data.name}.
          {hasMirror ? " Lighter narrow bars: the same flow as reported by the partner (mirror data, includes freight and insurance)." : " Mirror data appears here once the partner-reported series is ingested."}
        </p>
        {trade.length === 0 ? (
          <p className="text-sm text-ink-3">No trade rows for this selection. Missing means not reported, not zero.</p>
        ) : (
          <>
            <PlotFigure options={tradeOptions} ariaLabel={`Exports of ${mineral === "all" ? "core minerals" : prettyMineral(mineral)} from ${data.name} by destination, 2008 to 2026${isReal ? "" : ", sample data"}`} />
            <DataTable rows={trade} caption="Exports by destination" columns={[{ key: "year", label: "Year" }, { key: "partner", label: "Destination" }, { key: "kind", label: "Reported by" }, { key: "value", label: "US$ m", format: (v) => fmtMusd(v as number) }]} />
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
        <SectionHeader id="events-h" title={allYears ? "Deals, loans, investments and agreements, all years" : `Deals, loans, investments and agreements in ${year}`} tags={<><DataLayerTag layer={data.layers?.actions} /><LayerLabel layer="facts" /></>} />
        {allEvents.length > 0 && (
          <>
            <p className="mb-1 text-xs text-ink-3">Every recorded event, by date and side; the circle area follows the published amount (hollow: no amount published); the shaded band is {year}. Hover for the record.</p>
            <PlotFigure options={timelineOptions} ariaLabel={`Timeline of ${allEvents.length} recorded deals, loans, investments and agreements in ${data.name} by actor side, circle size by amount`} />
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
          <button type="button" onClick={() => setEventsShown((n) => n + 30)} className="btn mt-2 h-8 px-3 text-xs">
            Show {Math.min(30, events.length - eventsShown)} more of {events.length - eventsShown} remaining
          </button>
        )}
      </section>

      {production.length > 0 && (
        <section aria-labelledby="prod-h">
          <SectionHeader id="prod-h" title={`Production and reserves in ${year}`} tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>} intro={`${productionGroups.length} mineral series; where several sources or units report the same mineral, the first row is shown and the others open on request.`} />
          <table className="w-full text-xs">
            <thead><tr><th>Mineral</th><th>Measure</th><th className="text-right">Quantity</th><th>Unit</th><th>Source</th></tr></thead>
            <tbody>
              {productionGroups.map((g) => (
                <tr key={g.key} className="align-top">
                  <td className="font-medium">{prettyMineral(g.mineral)}</td>
                  <td>{g.measure}</td>
                  <td className="text-right tabular-nums">{g.rows[0].qty == null ? "—" : g.rows[0].qty.toLocaleString("en-GB")}</td>
                  <td>{g.rows[0].unit}</td>
                  <td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {contracts.length > 0 && (
        <section aria-labelledby="contracts-h">
          <SectionHeader id="contracts-h" title={`Published contracts (${contracts.length})`} tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>} intro="From the ResourceContracts database; the mineral and the companies are shown where the record carries them." />
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
            <button type="button" onClick={() => setContractsShown((n) => n + 40)} className="mt-2 rounded-full border border-rule px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">
              Show more ({contracts.length - contractsShown} remaining)
            </button>
          )}
        </section>
      )}
    </div>
  );
}
