"use client";

import { Icon } from "@/components/ui/Icons";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { fmtAmount } from "@/components/map/flows";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { buildIndexLookup, indexKey } from "@/lib/data";
import { fmtPct, fmtSigned } from "@/lib/format";
import type { FlowsFile, IndexFile, RealMeta } from "@/lib/types";

type Measure = "net" | "us" | "cn" | "share_cn" | "share_us" | "fin_cn" | "fin_us";
const MEASURES: { value: Measure; label: string; layer: "model" | "facts" }[] = [
  { value: "net", label: "Net lean of the influence index (China minus US)", layer: "model" },
  { value: "us", label: "US influence index", layer: "model" },
  { value: "cn", label: "China influence index", layer: "model" },
  { value: "share_cn", label: "Share of mineral exports going to China", layer: "facts" },
  { value: "share_us", label: "Share of mineral exports going to the United States", layer: "facts" },
  { value: "fin_cn", label: "Documented Chinese finance commitments per year", layer: "facts" },
  { value: "fin_us", label: "Documented US finance commitments per year", layer: "facts" },
];
/** Countries are told apart by dash pattern and an end label, so the actor hues keep their meaning elsewhere. */
const DASH = ["", "6,3", "2,3", "9,3,2,3"];
const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

interface Props {
  isos: string[];
  names: Record<string, string>;
  index: IndexFile | null;
  flows: FlowsFile | null;
  flowsLayer: "real" | "sample" | null;
  real: RealMeta | null;
  mineral: string;
  year: number;
  onRemove: (iso: string) => void;
  onClear: () => void;
  onHover: (iso: string | null) => void;
}

export function Compare({ isos, names, index, flows, flowsLayer, real, mineral, year, onRemove, onClear, onHover }: Props) {
  const [measure, setMeasure] = useState<Measure>("net");
  const lookup = useMemo(() => (index ? buildIndexLookup(index.rows) : null), [index]);
  const rows = useMemo(() => {
    const out: { iso3: string; name: string; year: number; value: number }[] = [];
    if (measure === "net" || measure === "us" || measure === "cn") {
      if (!lookup) return out;
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
        const { US, CN, ROW } = r.exports_musd;
        if (US === null || CN === null || ROW === null) continue;
        const tot = US + CN + ROW;
        if (tot <= 0) continue;
        out.push({ iso3: r.iso3, name: names[r.iso3] ?? r.iso3, year: r.year, value: (measure === "share_cn" ? CN : US) / tot });
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
    const yScale = measure === "net" ? { label: "Net lean (China minus US)", domain: [-100, 100] as [number, number], grid: true } : measure === "us" || measure === "cn" ? { label: "Index (0–100)", domain: [0, 100] as [number, number], grid: true } : measure.startsWith("share") ? { label: "Share of exports", domain: [0, 1] as [number, number], grid: true, tickFormat: (d: number) => fmtPct(d) } : { label: "M US$", grid: true };
    const last = isos.map((iso) => rows.filter((r) => r.iso3 === iso).at(-1)).filter((r): r is NonNullable<typeof r> => !!r);
    return {
      height: 300,
      marginLeft: 48,
      marginRight: 80,
      x: { label: null, tickFormat: (d: number) => String(d), domain: [YEAR_MIN, YEAR_MAX] },
      y: yScale,
      marks: [
        ...(measure === "net" ? [Plot.ruleY([0], { stroke: "#8a8f98" })] : []),
        ...isos.map((iso, i) => Plot.lineY(rows.filter((r) => r.iso3 === iso), { x: "year", y: "value", stroke: "#1b1d20", strokeWidth: 2, strokeDasharray: DASH[i], curve: "monotone-x", tip: true, title: (d: { year: number; name: string; value: number }) => `${d.year} ${d.name}: ${fmt(d.value)}` })),
        Plot.text(last, { x: "year", y: "value", text: "name", dx: 6, textAnchor: "start", fill: "#4a4f57", fontSize: 11 }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, isos, measure, year]);

  const table = useMemo(
    () =>
      isos.map((iso) => {
        const us = lookup?.get(indexKey(iso, year, "US", mineral))?.value ?? null;
        const cn = lookup?.get(indexKey(iso, year, "CN", mineral))?.value ?? null;
        const t = flows?.trade.find((r) => r.iso3 === iso && r.year === year && r.mineral === mineral);
        const tot = t && t.exports_musd.US !== null && t.exports_musd.CN !== null && t.exports_musd.ROW !== null ? t.exports_musd.US + t.exports_musd.CN + t.exports_musd.ROW : null;
        const fin = (origin: "US" | "CN") => (flows?.finance ?? []).filter((r) => r.iso3 === iso && r.origin === origin && r.year >= YEAR_MIN).reduce((n, r) => n + r.amount_musd, 0);
        const cov = real?.coverage?.[iso];
        return {
          name: names[iso] ?? iso,
          us: us === null ? "—" : us.toFixed(0),
          cn: cn === null ? "—" : cn.toFixed(0),
          net: us === null || cn === null ? "—" : fmtSigned(cn - us, 0),
          share_cn: tot && t ? fmtPct((t.exports_musd.CN ?? 0) / tot, 1) : "—",
          share_us: tot && t ? fmtPct((t.exports_musd.US ?? 0) / tot, 1) : "—",
          fin_cn: fmtAmount(fin("CN")),
          fin_us: fmtAmount(fin("US")),
          records: cov ? `${cov.events} events · ${cov.parliament_documents} records · ${cov.media_articles} headlines` : "sample",
        };
      }),
    [isos, lookup, year, mineral, flows, real, names],
  );
  const spec = MEASURES.find((m) => m.value === measure)!;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Compare · {isos.length} countries</p>
          <p className="serif mt-0.5 text-xl text-ink">Side by side</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={onClear}>Clear</button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {isos.map((iso, i) => (
          <li key={iso}>
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-outline bg-card px-2 py-0.5 text-xs font-medium" onMouseEnter={() => onHover(iso)} onMouseLeave={() => onHover(null)}>
              <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={DASH[i]} /></svg>
              {names[iso] ?? iso}
              <button type="button" onClick={() => onRemove(iso)} aria-label={`Remove ${names[iso] ?? iso} from the comparison`} className="ml-0.5 inline-flex text-ink-3 hover:text-ink"><Icon name="close" size={12} /></button>
            </span>
          </li>
        ))}
        {isos.length < 4 && <li className="self-center text-[11px] text-ink-3">Click the map or the ranking to add up to four</li>}
      </ul>
      <section aria-labelledby="cmp-h">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 id="cmp-h" className="text-base">Over time</h2>
          <span className="flex items-center gap-1.5">{spec.layer === "model" ? <LayerLabel layer="model" /> : <LayerLabel layer="facts" />}<DataLayerTag layer={spec.layer === "model" ? (index?.layer === "real" ? "real" : "sample") : flowsLayer ?? "sample"} /></span>
        </div>
        <label className="mb-2 flex items-center gap-2 text-xs"><span className="text-ink-2">Measure</span>
          <select className="input flex-1" value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}>
            {MEASURES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        {rows.length === 0 ? <p className="text-sm text-ink-3">No values for this measure{mineral !== "all" ? ` and mineral` : ""}.</p> : <PlotFigure options={options} ariaLabel={`${spec.label} over time for ${isos.map((i) => names[i] ?? i).join(", ")}`} />}
        <DataTable rows={rows} caption={`${spec.label} by year and country`} columns={[{ key: "year", label: "Year" }, { key: "name", label: "Country" }, { key: "value", label: "Value", format: (v) => fmt(Number(v)) }]} />
      </section>
      <section aria-labelledby="cmpt-h">
        <h2 id="cmpt-h" className="mb-1 text-base">In {year}</h2>
        <div className="scroll-x">
          <table className="w-full min-w-[40rem] text-xs [&_td]:px-1 [&_th]:px-1 [&_th]:whitespace-nowrap">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Country</th><th className="py-1 text-right">US index</th><th className="py-1 text-right">CN index</th><th className="py-1 text-right">Net</th><th className="py-1 text-right">Exports to CN</th><th className="py-1 text-right">Exports to US</th><th className="py-1 text-right">CN finance since 2008</th><th className="py-1 text-right">US finance since 2008</th><th className="py-1">Records</th></tr></thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.name} className="border-t border-rule align-top">
                  <td className="py-1 font-medium">{r.name}</td>
                  <td className="py-1 text-right tabular-nums">{r.us}</td>
                  <td className="py-1 text-right tabular-nums">{r.cn}</td>
                  <td className="py-1 text-right tabular-nums">{r.net}</td>
                  <td className="py-1 text-right tabular-nums">{r.share_cn}</td>
                  <td className="py-1 text-right tabular-nums">{r.share_us}</td>
                  <td className="py-1 text-right tabular-nums">{r.fin_cn}</td>
                  <td className="py-1 text-right tabular-nums">{r.fin_us}</td>
                  <td className="py-1 text-ink-3">{r.records}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-ink-3">Index values are model outputs; shares and finance totals are facts from UN Comtrade, AidData and DFC (documented commitments since 2008). A dash means no value, not zero.</p>
      </section>
    </div>
  );
}
