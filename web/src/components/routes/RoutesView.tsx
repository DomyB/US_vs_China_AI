"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { Exhibit, KeyNumber, StepCard } from "@/components/story/Chapter";
import { WideFigure } from "@/components/story/Ch3Iceberg";
import { LayerLabel } from "@/components/ui/Badges";
import { PageGuide } from "@/components/ui/Reading";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { ACTOR_COLOR, COUNTRY_COUNT, COUNTRY_COUNT_WORD, COUNTRY_NAMES, IN_SCOPE, OTHER_COLOR } from "@/lib/constants";
import { loadRoutes } from "@/lib/data";
import { fmtMusd, fmtPct } from "@/lib/format";
import { BUYER_LABEL, destinationsFor, economyName, indirectByYear, indirectFor, latestRouteYear, originsFor, type Buyer, type RoutesFile } from "@/lib/routes";
import { replaceSearch } from "@/lib/url";

const REGION_COLOR = "#1d8f6e";
const VIA_COLOR = "#b8860b";
const mineralLabel = (m: string) => (m === "all" ? "all tracked minerals" : m.replace(/_/g, " "));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Where the ore goes: the buyer's imports by origin, the region's exports by destination and the intermediaries' two
 * legs, all reconciled BACI rows. Every figure is a sum of exported cells; the one derived number, the indirect bound,
 * is the smaller of an intermediary's two legs and is said to be a ceiling, not a trace.
 */
/** The page: the buyer, mineral and year live in the URL so a view can be linked. */
export function RoutesView({ mineral: mineralProp, embedded = false }: { mineral?: string; embedded?: boolean }) {
  const [file, setFile] = useState<RoutesFile | null | undefined>(undefined);
  const params = useSearchParams();
  const [local, setLocal] = useState<{ buyer?: Buyer; year?: number }>({});
  useEffect(() => {
    loadRoutes().then(setFile).catch(() => setFile(null));
  }, []);
  const buyer: Buyer = embedded ? local.buyer ?? "USA" : params.get("buyer") === "CHN" ? "CHN" : "USA";
  const mineral = mineralProp ?? (embedded ? "all" : params.get("mineral") ?? "all");
  const yearParam = embedded ? local.year ?? NaN : Number(params.get("year"));
  const latest = file ? latestRouteYear(file, buyer, mineral) : null;
  const year = file && Number.isFinite(yearParam) && file.years.includes(yearParam) ? yearParam : latest;
  const set = (k: "buyer" | "year" | "mineral", v: string) => {
    if (embedded) {
      setLocal((l) => ({ ...l, [k]: k === "year" ? Number(v) : (v as Buyer) }));
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    replaceSearch(next);
  };
  return <RoutesPanel file={file} buyer={buyer} mineral={mineral} mineralFixed={mineralProp != null} year={year} set={set} embedded={embedded} />;
}

function RoutesPanel({ file, buyer, mineral, mineralFixed, year, set, embedded }: { file: RoutesFile | null | undefined; buyer: Buyer; mineral: string; mineralFixed: boolean; year: number | null; set: (k: "buyer" | "year" | "mineral", v: string) => void; embedded: boolean }) {
  const origins = useMemo(() => (file && year != null ? originsFor(file, buyer, mineral, year) : null), [file, buyer, mineral, year]);
  const dests = useMemo(() => (file && year != null ? destinationsFor(file, mineral, year) : null), [file, mineral, year]);
  const indirect = useMemo(() => (file && year != null ? indirectFor(file, buyer, mineral, year) : null), [file, buyer, mineral, year]);
  const series = useMemo(() => (file ? indirectByYear(file, buyer, mineral) : []), [file, buyer, mineral]);

  if (file === undefined) return embedded ? <p className="text-sm text-ink-3">Loading the reconciled trade…</p> : <InsightsSkeleton />;
  if (!file || year == null) {
    const empty = <p className="text-sm text-ink-2">The reconciled bilateral trade (CEPII BACI) is not in this release yet; the exhibit fills with the next run of the <code>cepii_baci</code> adapter and an export.</p>;
    if (embedded) return empty;
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="eyebrow">Where the ore goes</p>
        <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">Where {buyer === "CHN" ? "China" : "the United States"} gets it</h1>
        <div className="mt-3">{empty}</div>
      </div>
    );
  }
  const who = BUYER_LABEL[buyer];
  const scope = new Set(IN_SCOPE);
  const viaSet = new Set(file.intermediaries);
  const kind = (iso: string) => (scope.has(iso) ? `one of the ${COUNTRY_COUNT}` : viaSet.has(iso) ? "an intermediary" : iso === "ROW" ? "rest of the world" : "elsewhere");
  const kindColor = { [`one of the ${COUNTRY_COUNT}`]: REGION_COLOR, "an intermediary": VIA_COLOR, elsewhere: OTHER_COLOR, "rest of the world": "#c9ccd2" };

  const originsFigure = origins && origins.named.length ? (
    <PlotFigure
      options={{
        height: 40 + 24 * (origins.named.length + (origins.rest ? 1 : 0)), marginLeft: 130,
        x: { label: `imports of ${who} by origin, ${year}, US$ m →`, grid: true },
        y: { label: null, domain: [...origins.named.map((o) => economyName(o.origin)), ...(origins.rest ? ["rest of the world"] : [])] },
        color: { legend: true, domain: Object.keys(kindColor), range: Object.values(kindColor) },
        marks: [
          Plot.barX([...origins.named, ...(origins.rest ? [origins.rest] : [])].map((o) => ({ c: economyName(o.origin), v: o.musd, k: kind(o.origin), share: origins.world ? o.musd / origins.world.musd : null })), { y: "c", x: "v", fill: "k", tip: true, title: (d: { c: string; v: number; k: string; share: number | null }) => `${d.c} (${d.k}): ${fmtMusd(d.v)}${d.share != null ? `, ${fmtPct(d.share, 0)} of ${who}'s imports` : ""}` }),
        ],
      } as PlotOptions}
      ariaLabel={`Imports of ${mineralLabel(mineral)} by ${who} in ${year} by origin, the countries of the region and the intermediaries marked`}
    />
  ) : null;
  const destsFigure = dests && dests.named.length ? (
    <PlotFigure
      options={{
        height: 40 + 24 * (dests.named.length + (dests.rest ? 1 : 0)), marginLeft: 130,
        x: { label: `exports of the ${COUNTRY_COUNT_WORD} countries by destination, ${year}, US$ m →`, grid: true },
        y: { label: null, domain: [...dests.named.map((d) => economyName(d.dest)), ...(dests.rest ? ["rest of the world"] : [])] },
        color: { legend: true, domain: ["to China", "to the United States", "to an intermediary", "within the region", "elsewhere"], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US, VIA_COLOR, REGION_COLOR, OTHER_COLOR] },
        marks: [
          Plot.barX([...dests.named, ...(dests.rest ? [dests.rest] : [])].map((d) => ({ c: economyName(d.dest), v: d.musd, k: d.dest === "CHN" ? "to China" : d.dest === "USA" ? "to the United States" : viaSet.has(d.dest) ? "to an intermediary" : scope.has(d.dest) ? "within the region" : "elsewhere", share: dests.world ? d.musd / dests.world.musd : null, n: d.n })), { y: "c", x: "v", fill: "k", tip: true, title: (d: { c: string; v: number; k: string; share: number | null; n: number }) => `${d.c}: ${fmtMusd(d.v)} summed over ${d.n} exporting countr${d.n === 1 ? "y" : "ies"}${d.share != null ? `, ${fmtPct(d.share, 0)} of their exports` : ""}` }),
        ],
      } as PlotOptions}
      ariaLabel={`Exports of ${mineralLabel(mineral)} by the ${COUNTRY_COUNT} countries in ${year} by destination`}
    />
  ) : null;
  const overTime = series.filter((s) => s.world != null);
  const timeFigure = overTime.length > 1 ? (
    <PlotFigure
      options={{
        height: 260, marginLeft: 56,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: `↑ imports of ${who}, US$ bn`, grid: true, tickFormat: (d: number) => (d / 1000).toFixed(0) },
        color: { legend: true, domain: ["straight from the region", "via an intermediary, at most", "from elsewhere"], range: [REGION_COLOR, VIA_COLOR, OTHER_COLOR] },
        marks: [
          Plot.areaY(overTime.flatMap((s) => {
            const direct = s.direct ?? 0;
            const via = Math.min(s.bound_total, Math.max((s.world ?? 0) - direct, 0));
            const rest = Math.max((s.world ?? 0) - direct - via, 0);
            return [{ year: s.year, v: direct, k: "straight from the region", o: 0 }, { year: s.year, v: via, k: "via an intermediary, at most", o: 1 }, { year: s.year, v: rest, k: "from elsewhere", o: 2 }];
          }), { x: "year", y: "v", fill: "k", order: "o", fillOpacity: 0.8, tip: true, title: (d: { year: number; v: number; k: string }) => `${d.year}, ${d.k}: ${fmtMusd(d.v)}` }),
        ],
      } as PlotOptions}
      ariaLabel={`Imports of ${mineralLabel(mineral)} by ${who} by year, split between the region directly, the intermediaries' bound and elsewhere`}
    />
  ) : null;

  const directShare = indirect && indirect.direct != null && indirect.world ? indirect.direct / indirect.world : null;
  const boundShare = indirect && indirect.world ? indirect.bound_total / indirect.world : null;
  const topLeg = indirect?.legs.find((l) => l.bound != null) ?? null;

  const controls = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1">Buyer <select className="input text-xs" value={buyer} onChange={(e) => set("buyer", e.target.value)}><option value="USA">United States</option><option value="CHN">China</option></select></label>
      {!mineralFixed && <label className="flex items-center gap-1">Mineral <select className="input text-xs" value={mineral} onChange={(e) => set("mineral", e.target.value)}>{file.minerals.map((m) => <option key={m} value={m}>{cap(mineralLabel(m))}</option>)}</select></label>}
      <label className="flex items-center gap-1">Year <select className="input text-xs" value={year} onChange={(e) => set("year", e.target.value)}>{file.years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
    </div>
  );

  const body = (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <KeyNumber value={indirect?.world != null ? fmtMusd(indirect.world) : "—"} label={<>{cap(who)} imported this much {mineralLabel(mineral)} from the world in {year} (reconciled)</>} tone={buyer === "USA" ? "us" : "cn"} size="text-3xl sm:text-4xl" />
        <KeyNumber value={directShare != null ? fmtPct(directShare, 0) : "—"} label={<>of it came straight from the {COUNTRY_COUNT_WORD} countries{indirect?.direct != null ? ` (${fmtMusd(indirect.direct)})` : ""}</>} size="text-3xl sm:text-4xl" />
        <KeyNumber value={boundShare != null ? `≤ ${fmtPct(boundShare, 0)}` : "—"} label={<>at most could have come through an intermediary{topLeg ? `; the largest ceiling is ${economyName(topLeg.iso3)} at ${fmtMusd(topLeg.bound ?? 0)}` : ""}</>} size="text-3xl sm:text-4xl" />
      </div>
      <Exhibit id="r-origins" title={`Where ${who} gets it: imports by origin`} layer="facts" sources={["cepii_baci"]} ids={[`trade_flow:${buyer}:M:${mineral}:${year}`]} note={`${cap(who)}'s imports of ${mineralLabel(mineral)} in ${year} by origin, the largest named and the rest of the world as the difference to the world total; the ${COUNTRY_COUNT_WORD} countries in green, the economies that take most of the region's exports (the intermediaries) in gold. Reconciled bilateral trade (CEPII BACI), the same HS6 codes the case files use.`}
        asks={`Where does ${who} get ${mineral === "all" ? "its tracked minerals" : `its ${mineralLabel(mineral)}`}, and how much of that is the region's? One bar per origin puts the ${COUNTRY_COUNT_WORD} countries and the intermediaries beside everyone else on one scale.`}
        how="One bar per origin, longest first, the rest of the world as the last bar; the colour says what kind of origin it is and the tooltip gives its share of the buyer's world total where the file carries one. An origin with no bar has no reconciled row that year."
        says={`${directShare != null ? `${fmtPct(directShare, 0)} of ${who}'s ${mineralLabel(mineral)} in ${year} came straight from the ${COUNTRY_COUNT_WORD} countries` : `The green bars against the rest say how much of ${who}'s ${mineralLabel(mineral)} in ${year} came straight from the ${COUNTRY_COUNT_WORD} countries`}; a gold bar is an economy that takes much of the region's exports and sells to the buyer in the same codes, and the next exhibit bounds what could have passed through it.`}
        saysKind="facts">
        {originsFigure ?? <p className="text-sm text-ink-3">No import row for {who} in {year}.</p>}
      </Exhibit>
      <Exhibit id="r-via" title="The indirect route, bounded" layer="facts" sources={["cepii_baci"]} ids={[`trade_flow:via:${mineral}:${year}`]} caveat="The two legs are in the same product codes but are not one shipment: the bound is the smaller leg and says what could have passed through at most, not what did; processing changes the code and leaves the chain." note={`For each intermediary in ${year}: what it took from the ${COUNTRY_COUNT_WORD} countries in these codes (and the share of its own imports that is), what it sold to ${who} in the same codes, and the smaller of the two as the ceiling on ore that could have travelled the region → intermediary → ${who} route. Ore that was smelted or refined on the way changed code and is not in the chain.`}
        asks={`How much of what ${who} buys from third countries could have come from the region first? Two legs per intermediary, what it took from the region and what it sold to ${who}, give a ceiling that either leg alone cannot.`}
        how={`One row per intermediary, largest ceiling first; the ceiling is the smaller of its two legs, what it took from the ${COUNTRY_COUNT_WORD} countries and what it sold to ${who} in the same codes, and it is a ceiling on what could have passed through, never an estimate of what did. A row with no second leg has no ceiling, and the area chart stacks the direct figure, the summed ceiling and the rest by year.`}
        says={`${boundShare != null ? `At most ${fmtPct(boundShare, 0)} of ${who}'s imports in ${year} could have come through an intermediary${topLeg ? `, and the largest single ceiling is ${economyName(topLeg.iso3)}'s` : ""}; the true figure sits anywhere between nothing and that.` : `No intermediary has both legs in ${year}, so the route cannot be bounded.`} Ore refined on the way changed code and left the chain, so the ceiling does not cover processed products.`}>
        {indirect && indirect.legs.length ? (
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 pr-4">Intermediary</th><th className="py-1 pr-4">Took from the region</th><th className="py-1 pr-4">Share of its imports</th><th className="py-1 pr-4">Sold to {who}</th><th className="py-1 pr-4">Ceiling on the route</th><th className="py-1">From</th></tr></thead>
              <tbody>
                {indirect.legs.slice(0, 12).map((l) => (
                  <tr key={l.iso3} className="border-t border-rule-2">
                    <td className="py-1 pr-4 font-semibold">{economyName(l.iso3)}</td>
                    <td className="py-1 pr-4 font-mono tabular-nums">{fmtMusd(l.from_region)}</td>
                    <td className="py-1 pr-4 font-mono tabular-nums">{l.region_share != null ? fmtPct(l.region_share, 0) : "—"}</td>
                    <td className="py-1 pr-4 font-mono tabular-nums">{l.to_buyer != null ? fmtMusd(l.to_buyer) : "no row"}</td>
                    <td className="py-1 pr-4 font-mono tabular-nums">{l.bound != null ? `≤ ${fmtMusd(l.bound)}` : "—"}</td>
                    <td className="py-1 text-xs text-ink-2">{Object.entries(l.from).slice(0, 4).map(([iso, v]) => `${COUNTRY_NAMES[iso] ?? iso} ${fmtMusd(v)}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-ink-3">No intermediary took {mineralLabel(mineral)} from the region in {year}.</p>}
        {timeFigure && <div className="mt-4"><WideFigure minWidth="36rem">{timeFigure}</WideFigure></div>}
      </Exhibit>
      <Exhibit id="r-dests" title={`Where the ${COUNTRY_COUNT_WORD} countries send it: exports by destination`} layer="facts" sources={["cepii_baci"]} ids={[`trade_flow:scope:X:${mineral}:${year}`]} note={`Exports of ${mineralLabel(mineral)} in ${year} summed over the countries of the region with a reconciled world total that year, by destination; the intermediaries are the destinations that took the most over the whole period, China and the United States aside${file.intermediaries.length ? ` (${file.intermediaries.slice(0, 6).map(economyName).join(", ")}${file.intermediaries.length > 6 ? ", …" : ""})` : ""}.`} explore={{ href: `/explore?view=trade${mineral !== "all" ? `&mineral=${mineral}` : ""}`, label: "Open the trade arcs" }}
        asks={`Where do the ${COUNTRY_COUNT_WORD} countries send their ${mineralLabel(mineral)}, and how much of it goes to the two buyers against everyone else? One bar per destination puts China, the United States and the intermediaries on one scale.`}
        how="One bar per destination, longest first, the rest of the world as the last bar; the colour says whether the destination is a buyer, an intermediary, a country of the region or elsewhere, and the tooltip counts the exporting countries behind the sum. A country without a world total that year is left out of every bar."
        says="Read the China and United States bars against the gold ones: ore that goes to an intermediary is what the ceiling above is built from, and a mineral whose largest destination is an intermediary is one whose final buyer the record cannot name.">
        {destsFigure ?? <p className="text-sm text-ink-3">No export row in {year}.</p>}
      </Exhibit>
    </>
  );

  if (embedded) {
    return (
      <div>
        {controls}
        {body}
      </div>
    );
  }
  const countryYear = file.country_destinations.filter((d) => d.year === year && d.dest !== "WLD" && d.dest !== "ROW");
  const byCountry = new Map<string, typeof countryYear>();
  for (const d of countryYear) byCountry.set(d.iso3, [...(byCountry.get(d.iso3) ?? []), d]);
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow">Where the ore goes</p>
        <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">Where {who} gets it</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2">The case files say who buys the ore from each country. This page turns the question round: where do the two buyers get it, and how much of what they buy from a third country could have come from the region first? The record cannot follow a shipment, so the indirect route is a ceiling, never a trace.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><LayerLabel layer="facts" /><span className="text-xs text-ink-3">CEPII BACI, reconciled bilateral trade, {file.years[0]}–{file.years[file.years.length - 1]}</span></div>
        <div className="mt-4">
          <PageGuide
            purpose="Where the ore goes: the two buyers' imports by origin, the region's exports by destination, and the ceiling on the indirect route through third countries."
            read="Pick the buyer, the mineral and the year; the three numbers and the exhibits follow, and the URL keeps the choice so a view can be linked. The ceiling is the smaller of an intermediary's two legs, what could at most have passed through, never what did."
            next={[{ href: "/mineral", label: "The mineral case files" }, { href: "/explore?view=trade", label: "The trade arcs on the map" }]}
          />
        </div>
      </header>
      <div className="mt-5">{controls}</div>
      {body}
      {byCountry.size > 0 && (
        <Exhibit id="r-countries" title={`Each country's largest destinations, all minerals, ${year}`} layer="facts" sources={["cepii_baci"]} ids={[`trade_flow:scope:X:all:${year}`]} note="The four largest destinations of each country's tracked exports in the year, reconciled; a country without a world total that year is absent."
          asks="Which destinations matter most to each country on its own, rather than to the region as a whole? A card per country with its four largest keeps the small exporters visible beside the large ones."
          how="One card per country, its four largest destinations that year with the reconciled value, largest first; a country with no card has no world total that year, not no exports."
          says="Compare the first line across the cards: where it is the same buyer for most, the region's lean is broad; where it differs, the regional sum hides a split the case files take up. The values are one year's trade, not a trend.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(byCountry.entries()).sort((a, b) => (COUNTRY_NAMES[a[0]] ?? a[0]).localeCompare(COUNTRY_NAMES[b[0]] ?? b[0])).map(([iso, rows]) => (
              <div key={iso} className="rounded-md border border-rule-2 px-3 py-2 text-xs">
                <Link href={`/country/${iso}?tab=actions`} className="font-semibold underline">{COUNTRY_NAMES[iso] ?? iso}</Link>
                <ul className="mt-1 space-y-0.5 text-ink-2">{rows.slice(0, 4).map((r) => <li key={r.dest} className="flex justify-between gap-2"><span>{economyName(r.dest)}</span><span className="font-mono tabular-nums">{fmtMusd(r.musd)}</span></li>)}</ul>
              </div>
            ))}
          </div>
        </Exhibit>
      )}
      <StepCard className="mt-6">
        <p><strong>How to read it.</strong> {file.note} The <Link href="/mineral" className="underline">mineral case files</Link> carry the same view per mineral and the <Link href="/" className="underline">whole picture</Link> the direct figure beside the Comtrade one.</p>
      </StepCard>
    </div>
  );
}
