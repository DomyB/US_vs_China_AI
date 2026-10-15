"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { Exhibit } from "@/components/story/Chapter";
import { RoutesView } from "@/components/routes/RoutesView";
import { LayerLabel } from "@/components/ui/Badges";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { ACTOR_COLOR, COUNTRY_NAMES, IN_SCOPE, OTHER_COLOR } from "@/lib/constants";
import { loadMineral, loadMinerals } from "@/lib/data";
import { fmtMusd, fmtShare } from "@/lib/format";
import { exportsByYear, latestExports, mainSeries, unitsByCountries, type MineralFile, type MineralsFile } from "@/lib/minerals";
import { useSources } from "@/lib/useSources";
import { sourceNameMap } from "@/lib/sources";

const COUNTRY_COLORS = ["#1f5fa8", "#c8441c", "#6a4fb8", "#1d8f6e", "#b8860b", "#2a9d8f", "#e76f51", "#3d5a80", "#9b2226", "#588157", "#7b4b94", "#6c757d", "#0a9396", "#bb3e03", "#005f73", "#ae2012", "#94d2bd", "#ee9b00", "#001219", "#8d99ae"];
const colour = (iso: string) => COUNTRY_COLORS[Math.max(0, IN_SCOPE.indexOf(iso)) % COUNTRY_COLORS.length];
const name = (iso: string) => COUNTRY_NAMES[iso] ?? iso;
const fmtQty = (v: number | null) => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(2)} m` : v >= 1e3 ? `${(v / 1e3).toFixed(1)} k` : v.toFixed(v < 10 ? 2 : 0));

/** One mineral's case file: why it matters, who has it, who buys it, where it is, what it costs, and how the index reads it. */
export function MineralView({ id }: { id: string }) {
  const [file, setFile] = useState<MineralFile | null | undefined>(undefined);
  const [index, setIndex] = useState<MineralsFile | null>(null);
  const registry = useSources();
  const names = useMemo(() => sourceNameMap(registry), [registry]);
  useEffect(() => {
    loadMineral(id).then(setFile).catch(() => setFile(null));
    loadMinerals().then(setIndex).catch(() => setIndex(null));
  }, [id]);
  const series = useMemo(() => (file ? mainSeries(file.production, "production") : []), [file]);
  const reserves = useMemo(() => (file ? mainSeries(file.production, "reserves") : []), [file]);
  const latest = useMemo(() => (file ? latestExports(file.trade) : []), [file]);
  const byYear = useMemo(() => (file ? exportsByYear(file.trade) : []), [file]);
  const [measureUnit, setMeasureUnit] = useState<string | null>(null);
  const [priceUnitSel, setPriceUnitSel] = useState<string | null>(null);

  if (file === undefined) return <InsightsSkeleton />;
  if (!file) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="eyebrow">Mineral case file</p>
        <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">No such mineral</h1>
        <p className="mt-3 text-sm text-ink-2">The release carries no file for &ldquo;{id}&rdquo;. <Link href="/mineral" className="underline">The list of tracked minerals</Link>.</p>
      </div>
    );
  }
  const units = unitsByCountries(series);
  const unit = measureUnit && units.includes(measureUnit) ? measureUnit : units[0] ?? null;
  const drawn = series.filter((s) => s.unit === unit);
  // quantities compare only within one unit: the drawn unit's rows come first, then the other units, each largest first
  const byUnitThenQty = (first: string | null) => (a: { unit: string; row: { qty: number | null } }, b: { unit: string; row: { qty: number | null } }) => (a.unit === first ? 0 : 1) - (b.unit === first ? 0 : 1) || a.unit.localeCompare(b.unit) || (b.row.qty ?? 0) - (a.row.qty ?? 0);
  const latestProd = series.map((s) => ({ iso3: s.iso3, unit: s.unit, row: s.rows[s.rows.length - 1] })).filter((x) => x.row).sort(byUnitThenQty(unit));
  const resUnits = unitsByCountries(reserves);
  const latestRes = reserves.map((s) => ({ iso3: s.iso3, unit: s.unit, row: s.rows[s.rows.length - 1] })).filter((x) => x.row).sort(byUnitThenQty(resUnits[0] ?? null));
  const withCoords = file.concessions.filter((c) => c.lat != null && c.lon != null);
  const concByCountry = new Map<string, number>();
  for (const c of file.concessions) concByCountry.set(c.iso3, (concByCountry.get(c.iso3) ?? 0) + 1);
  const priceSeries = Array.from(new Set(file.prices.map((p) => p.series)));
  // one axis, one unit: the unit with the most points is drawn, the others are offered
  const priceUnits = unitsByCountries(Array.from(new Map(file.prices.map((p) => [p.series, { unit: p.unit }])).values()));
  const priceUnit = priceUnitSel && priceUnits.includes(priceUnitSel) ? priceUnitSel : priceUnits[0] ?? null;
  const pricesDrawn = file.prices.filter((p) => p.unit === priceUnit);
  const priceSeriesDrawn = Array.from(new Set(pricesDrawn.map((p) => p.series)));
  const indexLatest = (() => {
    const by = new Map<string, { year: number; CN?: number; US?: number }>();
    for (const r of file.index) {
      const cur = by.get(r.iso3);
      if (!cur || r.year > cur.year) by.set(r.iso3, { year: r.year, [r.actor]: r.value });
      else if (r.year === cur.year) cur[r.actor] = r.value;
    }
    return Array.from(by.entries()).map(([iso3, v]) => ({ iso3, ...v })).filter((v) => v.CN != null && v.US != null).sort((a, b) => (b.CN! - b.US!) - (a.CN! - a.US!));
  })();
  const others = index?.minerals.filter((m) => m.id !== file.id) ?? [];
  const sourceName = (sid: string | null) => (sid ? names[sid]?.name ?? sid : "—");
  const prodSources = Array.from(new Set(file.production.map((p) => p.source?.id).filter(Boolean))) as string[];
  const tradeSources = Array.from(new Set(file.trade.map((t) => t.source_id).filter(Boolean))) as string[];

  const productionFigure = drawn.length ? (
    <PlotFigure
      options={{
        height: 300, marginLeft: 56,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: `↑ production, ${unit}`, grid: true, tickFormat: (d: number) => fmtQty(d) },
        color: { legend: true, domain: drawn.map((s) => name(s.iso3)), range: drawn.map((s) => colour(s.iso3)) },
        marks: [
          Plot.lineY(drawn.flatMap((s) => s.rows.map((r) => ({ ...r, c: name(s.iso3) }))), { x: "year", y: "qty", stroke: "c", strokeWidth: 2, curve: "monotone-x", tip: true, title: (d: { year: number; qty: number; c: string; note: string | null; source: { id: string | null } | null }) => `${d.c}, ${d.year}: ${fmtQty(d.qty)} ${unit}${d.note ? `\n${d.note}` : ""}\n${sourceName(d.source?.id ?? null)}` }),
        ],
      } as PlotOptions}
      ariaLabel={`Production of ${file.name} by country and year, ${unit}`}
    />
  ) : null;
  const buyersFigure = latest.length ? (
    <PlotFigure
      options={{
        height: 40 + 28 * latest.length, marginLeft: 110,
        x: { label: "reported exports, latest year with a world total, US$ m →", grid: true },
        y: { label: null, domain: latest.map((c) => name(c.iso3)) },
        color: { legend: true, domain: ["to China", "to the United States", "to the rest of the world"], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US, OTHER_COLOR] },
        marks: [
          Plot.barX(latest.flatMap((c) => {
            const cn = c.musd.CN ?? 0; const us = c.musd.US ?? 0; const w = c.musd.WLD ?? 0;
            const row = c.musd.CN != null && c.musd.US != null ? Math.max(w - cn - us, 0) : null;
            return [{ c: name(c.iso3), s: "to China", v: c.musd.CN, year: c.year }, { c: name(c.iso3), s: "to the United States", v: c.musd.US, year: c.year }, { c: name(c.iso3), s: "to the rest of the world", v: row, year: c.year }].filter((d) => d.v != null);
          }), { y: "c", x: "v", fill: "s", tip: true, title: (d: { c: string; s: string; v: number; year: number }) => `${d.c}, ${d.year}: ${fmtMusd(d.v)} ${d.s}` }),
        ],
      } as PlotOptions}
      ariaLabel={`Latest reported exports of ${file.name} by country, split between China, the United States and the rest of the world`}
    />
  ) : null;
  const byYearFigure = byYear.length ? (
    <PlotFigure
      options={{
        height: 240, marginLeft: 56,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: "↑ reported exports, US$ m, summed over reporters", grid: true },
        color: { legend: true, domain: ["to China", "to the United States", "world total"], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US, OTHER_COLOR] },
        marks: [
          Plot.lineY(byYear.flatMap((y) => [{ year: y.year, v: y.CN, s: "to China", n: y.n }, { year: y.year, v: y.US, s: "to the United States", n: y.n }, { year: y.year, v: y.WLD, s: "world total", n: y.n }]).filter((d) => d.v != null), { x: "year", y: "v", stroke: "s", strokeWidth: 2, curve: "monotone-x", tip: true, title: (d: { year: number; v: number; s: string; n: number }) => `${d.year}, ${d.s}: ${fmtMusd(d.v)} over ${d.n} reporting countr${d.n === 1 ? "y" : "ies"}` }),
        ],
      } as PlotOptions}
      ariaLabel={`Reported exports of ${file.name} to China, the United States and the world by year`}
    />
  ) : null;
  const priceFigure = pricesDrawn.length ? (
    <PlotFigure
      options={{
        height: 220, marginLeft: 56,
        x: { label: null, type: "utc" },
        y: { label: `↑ price, ${priceUnit}`, grid: true },
        color: { legend: priceSeriesDrawn.length > 1, domain: priceSeriesDrawn },
        marks: [Plot.lineY(pricesDrawn.map((p) => ({ ...p, d: new Date(p.date) })), { x: "d", y: "price", stroke: "series", strokeWidth: 1.5, tip: true, title: (p: { series: string; date: string; price: number; unit: string }) => `${p.series}, ${p.date}: ${p.price.toLocaleString("en-GB")} ${p.unit}` })],
      } as PlotOptions}
      ariaLabel={`Price series for ${file.name}, ${priceUnit}`}
    />
  ) : null;
  const concessionMap = withCoords.length ? (
    <PlotFigure
      options={{
        height: 360, projection: { type: "mercator", domain: { type: "MultiPoint", coordinates: withCoords.map((c) => [c.lon as number, c.lat as number]) }, inset: 20 },
        marks: [Plot.dot(withCoords, { x: "lon", y: "lat", r: 3, fill: (c: { iso3: string }) => colour(c.iso3), fillOpacity: 0.6, tip: true, title: (c: { title: string | null; holder: string | null; iso3: string; status: string | null }) => `${c.title ?? ""}\n${c.holder ?? ""}\n${name(c.iso3)} · ${c.status ?? ""}` })],
      } as PlotOptions}
      ariaLabel={`Concessions for ${file.name} with coordinates`}
    />
  ) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow"><Link href="/mineral" className="hover:underline">Mineral case files</Link> · {file.core ? "core mineral" : "context mineral"}</p>
        <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">{file.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full border px-2 py-0.5 ${file.on_us_list ? "border-us text-us" : "border-outline text-ink-3"}`}>{file.on_us_list ? "on the US critical minerals list (2025)" : "not on the US list"}</span>
          <span className={`rounded-full border px-2 py-0.5 ${file.on_cn_list ? "border-cn text-cn" : "border-outline text-ink-3"}`}>{file.on_cn_list ? "on China's strategic minerals catalogue" : "not on China's catalogue"}</span>
          <LayerLabel layer="facts" />
        </p>
      </header>
      {file.image && (
        <figure className="mt-5 max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- a hot-linked Commons picture, not an asset of the site */}
          <img src={file.image.image_url} alt={`${file.name}: ${file.image.file.replace(/\.[a-z]+$/i, "").replace(/_/g, " ")}`} loading="lazy" className="max-h-80 w-full rounded-md border-2 border-outline object-cover" />
          <figcaption className="mt-1 text-[11px] text-ink-3">
            {file.image.page_url ? <a href={file.image.page_url} className="underline" target="_blank" rel="noreferrer">{file.image.file.replace(/_/g, " ")}</a> : file.image.file}
            {file.image.author ? <>, {file.image.author}</> : null}
            {file.image.license ? <>, {file.image.license_url ? <a href={file.image.license_url} className="underline" target="_blank" rel="noreferrer">{file.image.license}</a> : file.image.license}</> : null}
            , via Wikimedia Commons{file.image.article ? `, the lead picture of the Wikipedia article "${file.image.article}"` : ""}. A picture, not a record: nothing on this page is read from it.
          </figcaption>
        </figure>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card px-4 py-4 sm:px-5">
          <p className="eyebrow">Why it matters</p>
          <p className="mt-1 text-sm leading-relaxed"><strong>Uses.</strong> {file.uses ?? "Not yet written in the registry."}</p>
          <p className="mt-2 text-sm leading-relaxed"><strong>Why it is in this record.</strong> {file.why_it_matters ?? file.note ?? "—"}</p>
          {file.note && file.why_it_matters && <p className="mt-2 text-xs text-ink-2">{file.note}</p>}
          <p className="mt-2 text-[11px] text-ink-3">Curated text, labelled interpretation of public sources: {file.uses_source ?? "the registry"}. No figure in these two paragraphs is a number from the warehouse; the exhibits below are.</p>
        </div>
        <div className="card px-4 py-4 sm:px-5">
          <p className="eyebrow">In the record</p>
          <ul className="mt-1 space-y-1 text-sm">
            <li>Produced or explored in: {file.in_region.length ? file.in_region.map((iso, i) => <span key={iso}>{i > 0 && ", "}<Link href={`/country/${iso}?tab=actions`} className="underline">{name(iso)}</Link></span>) : "—"}</li>
            <li>Production rows: {file.production.filter((p) => p.measure === "production").length.toLocaleString("en-GB")} · reserves rows: {file.production.filter((p) => p.measure === "reserves").length.toLocaleString("en-GB")} from {prodSources.map(sourceName).join(", ") || "—"}</li>
            <li>Trade cells: {file.trade.length.toLocaleString("en-GB")} country-years ({Array.from(new Set(file.trade.map((t) => t.iso3))).length} countries) from {tradeSources.map(sourceName).join(", ") || "—"}</li>
            <li>HS6 codes: {file.hs_codes.map((h, i) => <span key={h.hs6} className="font-mono text-xs" title={`${h.description ?? ""}${h.shared ? " (shared subheading)" : ""}`}>{i > 0 && ", "}{h.hs6}{h.shared ? "*" : ""}</span>)}{file.hs_codes.some((h) => h.shared) && <span className="text-[11px] text-ink-3">* a subheading shared with other products</span>}</li>
            <li>Concessions naming it: {file.concessions.length.toLocaleString("en-GB")}{file.concessions.length ? ` (${Array.from(concByCountry.entries()).map(([k, v]) => `${name(k)} ${v}`).join(", ")})` : ""}; with coordinates: {withCoords.length}</li>
            <li>Price points: {file.prices.length.toLocaleString("en-GB")}{priceSeries.length ? ` (${priceSeries.join(", ")})` : ""}</li>
          </ul>
        </div>
      </section>

      <Exhibit id="m-production" title="Who has it: production by country" layer="facts" sources={prodSources} ids={[`production:${file.id}`]} note={`Mine production as the sources report it, in the unit shown; a country appears only where a source carries it, and the other units and measures are in the table. ${latestProd.length ? `Latest rows: ${latestProd.slice(0, 5).map((x) => `${name(x.iso3)} ${fmtQty(x.row.qty)} ${x.unit} (${x.row.year})`).join("; ")}.` : "No production row in the release."}`}
        asks="Which countries of the region mine this mineral, and has their output risen or fallen? One line per country puts every producer on the same axis and unit."
        how="One line per country in the unit selected, hover for the year's figure and its source; a line that starts late or stops early is a country whose source carries no row for those years, not an idle mine. The table under the chart lists each country's latest reserves row."
        says="The top line is the leading producer in this unit and a crossing is one country overtaking another; a rise or fall in output says nothing on its own about who bought it, which the next exhibit shows.">
        {units.length > 1 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span>Unit</span>
            <select className="input text-xs" value={unit ?? ""} onChange={(e) => setMeasureUnit(e.target.value)}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
          </div>
        )}
        {productionFigure ?? <p className="text-sm text-ink-3">No production series in the release for this mineral.</p>}
        {latestRes.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="text-xs">
              <thead><tr className="text-left text-ink-3"><th className="py-1 pr-4 font-semibold">Reserves, latest row</th><th className="py-1 pr-4 font-semibold">Quantity</th><th className="py-1 pr-4 font-semibold">Unit</th><th className="py-1 pr-4 font-semibold">Year</th><th className="py-1 font-semibold">Source</th></tr></thead>
              <tbody>{latestRes.map((x) => <tr key={x.iso3} className="border-t border-rule-2"><td className="py-1 pr-4 font-semibold">{name(x.iso3)}</td><td className="py-1 pr-4 font-mono tabular-nums">{fmtQty(x.row.qty)}</td><td className="py-1 pr-4">{x.unit}</td><td className="py-1 pr-4 font-mono tabular-nums">{x.row.year}</td><td className="py-1">{x.row.source?.url ? <a href={x.row.source.url} className="underline" target="_blank" rel="noreferrer">{sourceName(x.row.source.id)}</a> : sourceName(x.row.source?.id ?? null)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Exhibit>

      <Exhibit id="m-buyers" title="Who buys it: exports by destination" layer="facts" sources={tradeSources} ids={[`trade_flow:${file.id}:X`]} note={`Each country's latest year with a reported world total; the China and United States cells are the reporter's own partner rows, and the rest of the world is the difference only when both are present (an absent partner row is never read as zero, so a bar with no grey segment is a country whose partner rows are missing). ${file.importance.length ? `Shares of the world total: ${file.importance.filter((i) => i.share_cn != null).sort((a, b) => (b.exports_musd ?? 0) - (a.exports_musd ?? 0)).slice(0, 5).map((i) => `${i.name} ${fmtShare(i.share_cn)} to China, ${fmtShare(i.share_us)} to the United States (${i.year})`).join("; ")}.` : ""}`} explore={{ href: `/explore?view=trade&mineral=${file.id}`, label: "Open the trade arcs" }}
        asks="Does each producer's ore go to China, to the United States or elsewhere, and has the split moved over the years? Stacked bars put the buyers on one scale per country; the lines under them sum every reporter by year."
        how="One bar per country for its latest year with a world total, split by buyer, longest first; below, one line per destination summed over the reporting countries, with the count of reporters in the tooltip. A fall in a line can be a reporter dropping out, not less trade."
        says="The two buyers' segments against the grey say how much of the mineral's trade the two hold at all; the lines say whether the sum moved with the trade or with the number of reporters, so read a jump against the reporter count before reading it as a turn.">
        {buyersFigure ?? <p className="text-sm text-ink-3">No reported export row for this mineral.</p>}
        {byYearFigure && <div className="mt-4">{byYearFigure}</div>}
      </Exhibit>

      <Exhibit id="m-routes" title="Where the buyers get it, and the indirect route" layer="facts" sources={["cepii_baci"]} ids={[`trade_flow:M:${file.id}`]} explore={{ href: `/routes?mineral=${file.id}`, label: "Open the routes page" }} note={`The buyer's imports of ${file.name.toLowerCase()} by origin from the reconciled bilateral record (CEPII BACI), and the ceiling on what could have reached it from the region through an intermediary, the smaller of that economy's imports from the region and its exports to the buyer in the same codes. A ceiling, not a trace.`}
        asks="Where do the two buyers get this mineral, and could some of it have reached them from the region through a third country? Imports by origin answer the first; the two legs of each intermediary bound the second."
        how="Pick the buyer and the year; the bars are the buyer's imports by origin, the table is each intermediary's two legs with the smaller as the ceiling, and the area chart carries the direct figure and the summed ceiling over the years. A year without a world total has no ceiling."
        says="The ceiling says how much of the buyer's imports could at most have come from the region through an intermediary, never how much did; a small ceiling rules the route out, a large one only leaves it open.">
        <RoutesView mineral={file.id} embedded />
      </Exhibit>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Exhibit id="m-where" title="Where it is" layer="facts" sources={Array.from(new Set(file.concessions.map((c) => c.source?.id).filter(Boolean))) as string[]} ids={[`concession:${file.id}`]} note={withCoords.length ? `${withCoords.length} of ${file.concessions.length} concessions naming ${file.name.toLowerCase()} carry coordinates in the cadastre export; the others are listed by country only.` : file.concessions.length ? `The ${file.concessions.length} concessions naming ${file.name.toLowerCase()} come from cadastres that publish no coordinates in the fields the adapter reads (${Array.from(concByCountry.keys()).map(name).join(", ")}); the deposits named in the registry note are listed from it.` : "No cadastre in the release names this mineral; the places named come from the registry note, not from a geocoded record."}
          asks="Where in the region is this mineral held under a concession? A map of the cadastre points places the licences; without coordinates, a list by country stands in."
          how="One dot per concession naming the mineral, coloured by country, hover for its title, holder and status; only concessions with coordinates are drawn, so a country with no dots is one whose cadastre publishes none, not one without deposits."
          says="Clusters mark the districts where cadastres file licences for it, a right to explore or mine rather than a measure of output; the production exhibit above says what was dug.">
          {concessionMap ?? (
            <ul className="space-y-1 text-sm">
              <li><strong>Named in the registry note:</strong> {file.note ?? "—"}</li>
              {file.concessions.length > 0 && <li><strong>Concessions by country:</strong> {Array.from(concByCountry.entries()).map(([k, v]) => `${name(k)} ${v}`).join(", ")}</li>}
              <li><strong>Producers in the record:</strong> {file.producers.length ? file.producers.map(name).join(", ") : "none with a positive production row"}</li>
            </ul>
          )}
        </Exhibit>
        <Exhibit id="m-price" title="What it costs" layer="facts" sources={Array.from(new Set(file.prices.map((p) => p.source?.id).filter(Boolean))) as string[]} ids={[`price:${file.id}`]} note={file.prices.length ? `${file.prices.length} price points in ${priceSeries.length} series; the series name says which market and grade.` : "No price series in the release for this mineral."}
          asks="What has the mineral fetched on the market, and when did its price jump or fall? A dated line per series shows the level and the turns."
          how="One line per price series in the unit selected, dated along the axis, hover for the quote; a gap is a stretch with no quoted point. Series in another unit sit behind the selector, not on the same axis."
          says="A run-up in the line raises the value of the same tonnage, so a rise in the export lines above can be a price move rather than more ore; read the two together. Whether the price moved with demand or with supply is not visible here.">
          {priceUnits.length > 1 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span>Unit</span>
              <select className="input text-xs" value={priceUnit ?? ""} onChange={(e) => setPriceUnitSel(e.target.value)}>{priceUnits.map((u) => <option key={u} value={u}>{u}</option>)}</select>
              <span className="text-ink-3">one unit per axis; the other series are behind the selector</span>
            </div>
          )}
          {priceFigure ?? <p className="text-sm text-ink-3">No price series.</p>}
        </Exhibit>
      </div>

      {indexLatest.length > 0 && (
        <Exhibit id="m-index" title={`The index, ${file.name.toLowerCase()} only`} layer="model" ids={[`index_value:influence:*:${file.id}`]} model={{ name: "composite influence index computed with this mineral's trade shares in place of all minerals", status: "computed" }} note="The per-mineral index swaps the trade components for this mineral's own shares and keeps the other components; the latest year with both actors per country, sorted by net lean (China minus the United States)."
          asks="If the index were built on this mineral's trade shares alone, which countries would lean to China and which to the United States? A table, one row per country, sorted by net lean."
          how="One row per country for its latest year with both actors' values; the net lean is China minus the United States, positive in China's colour and negative in the United States'. A country absent from the table has no year with both."
          says={`The model puts ${name(indexLatest[0].iso3)} furthest toward China, at ${(indexLatest[0].CN! - indexLatest[0].US! > 0 ? "+" : "") + (indexLatest[0].CN! - indexLatest[0].US!).toFixed(1)}, and ${name(indexLatest[indexLatest.length - 1].iso3)} at the other end; the order is a model output that moves with the trade shares, not a measured fact.`}
          saysKind="model">
          <table className="text-xs">
            <thead><tr className="text-left text-ink-3"><th className="py-1 pr-4 font-semibold">Country</th><th className="py-1 pr-4 font-semibold">Year</th><th className="py-1 pr-4 font-semibold">China</th><th className="py-1 pr-4 font-semibold">United States</th><th className="py-1 font-semibold">Net lean</th></tr></thead>
            <tbody>{indexLatest.map((r) => <tr key={r.iso3} className="border-t border-rule-2"><td className="py-1 pr-4 font-semibold"><Link href={`/country/${r.iso3}?tab=analysis`} className="underline">{name(r.iso3)}</Link></td><td className="py-1 pr-4 font-mono tabular-nums">{r.year}</td><td className="py-1 pr-4 font-mono tabular-nums">{r.CN!.toFixed(1)}</td><td className="py-1 pr-4 font-mono tabular-nums">{r.US!.toFixed(1)}</td><td className={`py-1 font-mono tabular-nums ${r.CN! - r.US! > 0 ? "text-cn" : "text-us"}`}>{(r.CN! - r.US! > 0 ? "+" : "") + (r.CN! - r.US!).toFixed(1)}</td></tr>)}</tbody>
          </table>
        </Exhibit>
      )}

      {others.length > 0 && (
        <nav aria-label="Other minerals" className="mt-8 text-xs text-ink-2">
          Other minerals: {others.map((m, i) => <span key={m.id}>{i > 0 && " · "}<Link href={`/mineral/${m.id}`} className="underline">{m.name}</Link></span>)}
        </nav>
      )}
    </div>
  );
}
