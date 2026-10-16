"use client";

import { Icon } from "@/components/ui/Icons";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { fmtAmount } from "@/components/map/flows";
import { NET_LEAN_MAX } from "@/components/map/scales";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { IN_SCOPE, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { buildIndexLookup, indexKey } from "@/lib/data";
import { fmtPct, fmtSigned } from "@/lib/format";
import { INDEX_LABEL, INDEX_PHRASE, type IndexName } from "@/lib/indexView";
import type { FlowsFile, IndexRow, RealMeta } from "@/lib/types";

type Measure = "net" | "us" | "cn" | "share_cn" | "share_us" | "fin_cn" | "fin_us";
function measures(indexName: IndexName): { value: Measure; label: string; layer: "model" | "facts" }[] {
  const idx = INDEX_PHRASE[indexName];
  return [
    { value: "net", label: `Net lean of the ${idx} (China minus US)`, layer: "model" },
    { value: "us", label: `US ${idx}`, layer: "model" },
    { value: "cn", label: `China ${idx}`, layer: "model" },
    { value: "share_cn", label: "Share of mineral exports going to China", layer: "facts" },
    { value: "share_us", label: "Share of mineral exports going to the United States", layer: "facts" },
    { value: "fin_cn", label: "Documented Chinese finance commitments per year", layer: "facts" },
    { value: "fin_us", label: "Documented US finance commitments per year", layer: "facts" },
  ];
}
/** Countries are told apart by dash pattern (the chips under the title and the tooltips name each line). */
const DASH = ["", "6,3", "2,3", "9,3,2,3"];
const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

interface Props {
  isos: string[];
  names: Record<string, string>;
  /** the rows of the index chosen in the context bar (composite or a sub-index), already filtered to it */
  indexRows: IndexRow[];
  indexLayer: "real" | "sample" | "none" | null;
  indexName: IndexName;
  flows: FlowsFile | null;
  flowsLayer: "real" | "sample" | null;
  real: RealMeta | null;
  mineral: string;
  year: number;
  onRemove: (iso: string) => void;
  /** adds a country from the select (the map click and the ranking do the same elsewhere) */
  onAdd: (iso: string) => void;
  onClear: () => void;
  onHover: (iso: string | null) => void;
}

/** The reported world total of a flows.json trade cell: `WLD` (from the 2026-10-11 export), else the three cells when all exist; null otherwise. */
function worldTotal(e: { US: number | null; CN: number | null; ROW: number | null; WLD?: number | null }): number | null {
  if (e.WLD !== undefined) return e.WLD;
  return e.US !== null && e.CN !== null && e.ROW !== null ? e.US + e.CN + e.ROW : null;
}

export function Compare({ isos, names, indexRows, indexLayer, indexName, flows, flowsLayer, real, mineral, year, onRemove, onAdd, onClear, onHover }: Props) {
  const [measure, setMeasure] = useState<Measure>("net");
  const MEASURES = useMemo(() => measures(indexName), [indexName]);
  const lookup = useMemo(() => buildIndexLookup(indexRows), [indexRows]);
  const rows = useMemo(() => {
    const out: { iso3: string; name: string; year: number; value: number }[] = [];
    if (measure === "net" || measure === "us" || measure === "cn") {
      for (const iso of isos) {
        for (const y of YEARS) {
          const us = lookup.get(indexKey(iso, y, "US", mineral))?.value ?? null;
          const cn = lookup.get(indexKey(iso, y, "CN", mineral))?.value ?? null;
          const v = measure === "net" ? (us !== null && cn !== null ? cn - us : null) : measure === "us" ? us : cn;
          if (v !== null) out.push({ iso3: iso, name: names[iso] ?? iso, year: y, value: v });
        }
      }
    } else if (measure === "share_cn" || measure === "share_us") {
      for (const r of flows?.trade ?? []) {
        if (r.mineral !== mineral || !isos.includes(r.iso3)) continue;
        const tot = worldTotal(r.exports_musd);
        const part = measure === "share_cn" ? r.exports_musd.CN : r.exports_musd.US;
        if (part === null || tot === null || tot <= 0) continue; // an absent partner row is no share, never 0
        out.push({ iso3: r.iso3, name: names[r.iso3] ?? r.iso3, year: r.year, value: part / tot });
      }
    } else {
      const origin = measure === "fin_cn" ? "CN" : "US";
      for (const r of flows?.finance ?? []) {
        if (r.origin !== origin || !isos.includes(r.iso3) || r.year < YEAR_MIN) continue;
        out.push({ iso3: r.iso3, name: names[r.iso3] ?? r.iso3, year: r.year, value: r.amount_musd });
      }
    }
    return out.sort((a, b) => a.year - b.year);
  }, [measure, lookup, isos, mineral, flows, names]);

  const fmt = (v: number) => (measure === "net" ? fmtSigned(v, 0) : measure === "us" || measure === "cn" ? v.toFixed(0) : measure.startsWith("share") ? fmtPct(v, 1) : fmtAmount(v));
  const options = useMemo(() => {
    // the net lean is drawn on the ±60 scale the map, the heatmap and the ranking use
    const yScale = measure === "net" ? { label: `Net lean (China minus US), ${INDEX_PHRASE[indexName]}`, domain: [-NET_LEAN_MAX, NET_LEAN_MAX] as [number, number], clamp: true, grid: true } : measure === "us" || measure === "cn" ? { label: `${INDEX_LABEL[indexName]} (0–100)`, domain: [0, 100] as [number, number], grid: true } : measure.startsWith("share") ? { label: "Share of exports", domain: [0, 1] as [number, number], grid: true, tickFormat: (d: number) => fmtPct(d) } : { label: "M US$", grid: true };
    return {
      height: 300,
      marginLeft: 48,
      marginRight: 16,
      x: { label: null, tickFormat: (d: number) => String(d), domain: [YEAR_MIN, YEAR_MAX] },
      y: yScale,
      marks: [
        ...(measure === "net" ? [Plot.ruleY([0], { stroke: "#8a8f98" })] : []),
        ...isos.map((iso, i) => Plot.lineY(rows.filter((r) => r.iso3 === iso), { x: "year", y: "value", stroke: "#1b1d20", strokeWidth: 2, strokeDasharray: DASH[i], curve: "monotone-x", tip: true, title: (d: { year: number; name: string; value: number }) => `${d.year} ${d.name}: ${fmt(d.value)}` })),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, isos, measure, year, indexName]);

  const clamped = useMemo(() => (measure === "net" ? rows.filter((r) => Math.abs(r.value) > NET_LEAN_MAX).length : 0), [rows, measure]);

  const table = useMemo(
    () =>
      isos.map((iso) => {
        const us = lookup.get(indexKey(iso, year, "US", mineral))?.value ?? null;
        const cn = lookup.get(indexKey(iso, year, "CN", mineral))?.value ?? null;
        const t = flows?.trade.find((r) => r.iso3 === iso && r.year === year && r.mineral === mineral);
        const tot = t ? worldTotal(t.exports_musd) : null;
        const fin = (origin: "US" | "CN") => (flows?.finance ?? []).filter((r) => r.iso3 === iso && r.origin === origin && r.year >= YEAR_MIN).reduce((n, r) => n + r.amount_musd, 0);
        const cov = real?.coverage?.[iso];
        return {
          iso,
          name: names[iso] ?? iso,
          us: us === null ? "—" : us.toFixed(0),
          cn: cn === null ? "—" : cn.toFixed(0),
          net: us === null || cn === null ? "—" : fmtSigned(cn - us, 0),
          share_cn: tot && t && t.exports_musd.CN !== null ? fmtPct(t.exports_musd.CN / tot, 1) : "—",
          share_us: tot && t && t.exports_musd.US !== null ? fmtPct(t.exports_musd.US / tot, 1) : "—",
          fin_cn: fmtAmount(fin("CN")),
          fin_us: fmtAmount(fin("US")),
          records: cov ? `${cov.events} events · ${cov.parliament_documents} legislative records · ${cov.media_articles} headlines` : "sample",
        };
      }),
    [isos, lookup, year, mineral, flows, real, names],
  );
  const spec = MEASURES.find((m) => m.value === measure)!;
  const addable = IN_SCOPE.filter((c) => !isos.includes(c));

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Compare · {isos.length} countries</p>
          <p className="serif mt-0.5 text-xl text-ink">Side by side</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={onClear}>Clear</button>
      </div>
      <ul className="flex flex-wrap items-center gap-1.5">
        {isos.map((iso, i) => (
          <li key={iso}>
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-outline bg-card px-2 py-0.5 text-xs font-medium" onMouseEnter={() => onHover(iso)} onMouseLeave={() => onHover(null)}>
              <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={DASH[i]} /></svg>
              {names[iso] ?? iso}
              <button type="button" onClick={() => onRemove(iso)} aria-label={`Remove ${names[iso] ?? iso} from the comparison`} className="ml-0.5 inline-flex text-ink-3 hover:text-ink"><Icon name="close" size={12} /></button>
            </span>
          </li>
        ))}
        {isos.length < 4 && (
          <li className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <select className="input" aria-label="Add a country" value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
              <option value="">Add a country…</option>
              {addable.map((c) => <option key={c} value={c}>{names[c] ?? c}</option>)}
            </select>
            <span>or click the map, up to four</span>
          </li>
        )}
      </ul>
      <section aria-labelledby="cmp-h">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 id="cmp-h" className="text-base">Over time</h2>
          <span className="flex items-center gap-1.5">{spec.layer === "model" ? <LayerLabel layer="model" /> : <LayerLabel layer="facts" />}<DataLayerTag layer={spec.layer === "model" ? (indexLayer === "real" ? "real" : "sample") : flowsLayer ?? "sample"} /></span>
        </div>
        <label className="mb-2 flex items-center gap-2 text-xs"><span className="text-ink-2">Measure</span>
          <select className="input flex-1" value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}>
            {MEASURES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        {rows.length === 0 ? <p className="text-sm text-ink-3">No values for this measure{mineral !== "all" ? ` and mineral${indexName !== "composite" && spec.layer === "model" ? " (the sub-indices are computed for all minerals together)" : ""}` : ""}.</p> : <PlotFigure options={options} ariaLabel={`${spec.label} over time for ${isos.map((i) => names[i] ?? i).join(", ")}`} />}
        {clamped > 0 && <p className="mt-1 text-[11px] text-ink-3">{clamped} country-year{clamped === 1 ? " lies" : "s lie"} beyond ±{NET_LEAN_MAX} and {clamped === 1 ? "is" : "are"} drawn at the edge; the tooltip and the table keep the full value.</p>}
        <DataTable rows={rows} caption={`${spec.label} by year and country`} columns={[{ key: "year", label: "Year" }, { key: "name", label: "Country" }, { key: "value", label: "Value", format: (v) => fmt(Number(v)) }]} />
      </section>
      <section aria-labelledby="cmpt-h">
        <h2 id="cmpt-h" className="mb-1 text-base">In {year} <span className="text-xs font-normal text-ink-3">· {INDEX_PHRASE[indexName]}</span></h2>
        <div className="scroll-x">
          <table className="w-full text-xs [&_td]:px-1 [&_th]:px-1">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Country</th><th className="py-1 text-right">US index</th><th className="py-1 text-right">CN index</th><th className="py-1 text-right">Net</th><th className="py-1 text-right">Exports to CN</th><th className="py-1 text-right">Exports to US</th><th className="py-1 text-right">CN finance since {YEAR_MIN}</th><th className="py-1 text-right">US finance since {YEAR_MIN}</th></tr></thead>
            <tbody>
              {table.map((r) => (
                <Row key={r.iso} r={r} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-ink-3">Index values are model outputs; shares and finance totals are facts from UN Comtrade, AidData and the DFC and EXIM (documented commitments since {YEAR_MIN}). A dash means no value, not zero. The record counts under each country are the case file&apos;s coverage.</p>
      </section>
    </div>
  );
}

/** One country: its numbers on one line, its record counts on a second, so the table fits the drawer without a ninth column. */
function Row({ r }: { r: { iso: string; name: string; us: string; cn: string; net: string; share_cn: string; share_us: string; fin_cn: string; fin_us: string; records: string } }) {
  return (
    <>
      <tr className="border-t border-rule align-top">
        <td className="py-1 font-medium">{r.name}</td>
        <td className="py-1 text-right tabular-nums whitespace-nowrap">{r.us}</td>
        <td className="py-1 text-right tabular-nums whitespace-nowrap">{r.cn}</td>
        <td className="py-1 text-right tabular-nums whitespace-nowrap">{r.net}</td>
        <td className="py-1 text-right tabular-nums whitespace-nowrap">{r.share_cn}</td>
        <td className="py-1 text-right tabular-nums whitespace-nowrap">{r.share_us}</td>
        <td className="py-1 text-right tabular-nums whitespace-nowrap">{r.fin_cn}</td>
        <td className="py-1 text-right tabular-nums whitespace-nowrap">{r.fin_us}</td>
      </tr>
      <tr>
        <td colSpan={8} className="pb-1 text-[10px] text-ink-3">{r.records}</td>
      </tr>
    </>
  );
}
