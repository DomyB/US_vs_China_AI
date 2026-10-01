"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { SourceLink } from "@/components/ui/SourceLink";
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
      height: 200,
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

  const events = useMemo(() => data.actions.events.filter((e) => e.year === year && (mineral === "all" || e.mineral === mineral)).sort((a, b) => a.date.localeCompare(b.date)), [data, year, mineral]);
  const contracts = useMemo(() => (data.actions.contracts ?? []).filter((c) => mineral === "all" || c.mineral === mineral), [data, mineral]);
  const production = useMemo(() => (data.actions.production ?? []).filter((p) => (mineral === "all" || p.mineral === mineral) && p.year === year), [data, mineral, year]);
  const sideColor = { US: ACTOR_COLOR.US, CN: ACTOR_COLOR.CN, other: OTHER_COLOR } as const;

  return (
    <div className="space-y-5">
      <section aria-labelledby="trade-h">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 id="trade-h" className="text-sm font-semibold">Mineral exports by destination</h3>
          <span className="flex items-center gap-1"><DataLayerTag layer={data.layers?.actions} /><LayerLabel layer="facts" /></span>
        </div>
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
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 id="events-h" className="text-sm font-semibold">Deals, loans, investments and agreements in {year}</h3>
          <span className="flex items-center gap-1"><DataLayerTag layer={data.layers?.actions} /><LayerLabel layer="facts" /></span>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-ink-3">No recorded events for this selection. Absence of a record is not evidence of absence.</p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {events.map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs tabular-nums text-ink-3">{fmtDate(e.date)}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: sideColor[e.actor_side] }}>
                    <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: sideColor[e.actor_side] }} />
                    {e.actor_side === "other" ? "Other actor" : e.actor_side === "US" ? "US-linked" : "China-linked"}
                  </span>
                  <span className="text-xs text-ink-2">{prettyLabel(e.type)} · {prettyMineral(e.mineral)}</span>
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
      </section>

      {production.length > 0 && (
        <section aria-labelledby="prod-h">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 id="prod-h" className="text-sm font-semibold">Production and reserves in {year}</h3>
            <span className="flex items-center gap-1"><DataLayerTag layer="real" /><LayerLabel layer="facts" /></span>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Mineral</th><th className="py-1">Measure</th><th className="py-1 text-right">Quantity</th><th className="py-1">Unit</th><th className="py-1">Source</th></tr></thead>
            <tbody>
              {production.map((p, i) => (
                <tr key={i} className="border-t border-rule align-top">
                  <td className="py-1">{prettyMineral(p.mineral)}</td>
                  <td className="py-1">{p.measure}</td>
                  <td className="py-1 text-right tabular-nums">{p.qty == null ? "—" : p.qty.toLocaleString("en-GB")}</td>
                  <td className="py-1">{p.unit}</td>
                  <td className="py-1"><SourceLink source={p.source} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {contracts.length > 0 && (
        <section aria-labelledby="contracts-h">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 id="contracts-h" className="text-sm font-semibold">Published contracts ({contracts.length})</h3>
            <span className="flex items-center gap-1"><DataLayerTag layer="real" /><LayerLabel layer="facts" /></span>
          </div>
          <ul className="divide-y divide-rule border-y border-rule text-sm">
            {contracts.slice(0, 40).map((c) => (
              <li key={c.id} className="py-1.5">
                <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">{c.title}</a>
                <p className="text-xs text-ink-3">{[c.year, c.resource, c.type, c.companies].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
          {contracts.length > 40 && <p className="mt-1 text-xs text-ink-3">Showing 40 of {contracts.length}.</p>}
        </section>
      )}
    </div>
  );
}
