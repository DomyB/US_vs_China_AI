"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { feature as topoFeature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { YearControl } from "@/components/controls/YearControl";
import { Block } from "@/components/insights/shared";
import { SectionNav } from "@/components/ui/SectionNav";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { QUADRANTS, QUADRANT_LABEL, correlation, correlationByYear, firstYear, latestFullYear, leanPoints, meanLeans, movers, quadrant, sideWord, trajectories, withBoth, yearSplit, type BothLean, type Mover } from "@/lib/alignment";
import { YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { loadIndex } from "@/lib/data";
import { fmtSigned } from "@/lib/format";
import { glossaryHref } from "@/lib/glossary";
import { INDEX_FORMULA } from "@/lib/indexView";
import { lastYearsFrom, type Provenance } from "@/lib/provenance";
import { useTheme } from "@/lib/theme";
import type { IndexFile } from "@/lib/types";
import { useRealMeta } from "@/lib/useRealMeta";
import { LeanMaps, type CountryFeature } from "./LeanMaps";
import { QUADRANT_COLOR, QuadrantChart } from "./Quadrant";
import { AXIS_COLOR, Trajectories } from "./Trajectories";

type Features = FeatureCollection<Geometry, CountryFeature["properties"]>;

const SECTIONS = [
  { id: "maps-h", label: "Two maps" },
  { id: "quadrant-h", label: "Where each sits" },
  { id: "movers-h", label: "Who moved" },
  { id: "lines-h", label: "Every country" },
  { id: "reading-h", label: "Reading" },
];

const SOURCES = ["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "wb_ids", "unga_votes", "wb_wdi"];

function useCols(): number {
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setCols(mq.matches ? 4 : 2);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return cols;
}

const r2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));

/**
 * "Votes and ore": the political half of the influence index (UN voting, legislative stance) set against the economic
 * half (trade shares, finance, debt), one year at a time and over the whole record. Every number is derived here from
 * index.json; the page says so on each block and hands the reader the drawer.
 */
export function AlignmentView() {
  const meta = useRealMeta();
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const cols = useCols();
  const [index, setIndex] = useState<IndexFile | null | undefined>(undefined);
  const [features, setFeatures] = useState<Features | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    loadIndex().then(setIndex).catch(() => setIndex(null));
    fetch("/data/south-america.topo.json")
      .then((r) => r.json() as Promise<Topology>)
      .then((t) => setFeatures(topoFeature(t, t.objects.sa_raw) as unknown as Features))
      .catch(() => setFeatures(null));
  }, []);

  const points = useMemo(() => (index ? leanPoints(index.rows) : []), [index]);
  const both = useMemo(() => withBoth(points), [points]);
  const corr = useMemo(() => correlation(both), [both]);
  const byYear = useMemo(() => correlationByYear(both), [both]);
  const first = useMemo(() => firstYear(both), [both]);
  const latest = useMemo(() => latestFullYear(both), [both]);
  const paths = useMemo(() => trajectories(points), [points]);
  const means = useMemo(() => meanLeans(points), [points]);

  useEffect(() => {
    if (year != null || index === undefined) return;
    const fromUrl = Number(params.get("year"));
    setYear(Number.isFinite(fromUrl) && fromUrl >= YEAR_MIN && fromUrl <= YEAR_MAX ? fromUrl : (latest ?? YEAR_MAX - 1));
  }, [year, index, params, latest]);

  const changeYear = useCallback(
    (y: number) => {
      setYear(y);
      const next = new URLSearchParams(params.toString());
      next.set("year", String(y));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const togglePlay = useCallback(() => setPlaying((v) => !v), []);

  const split = useMemo(() => (year == null ? null : yearSplit(both, year)), [both, year]);
  const yearMaps = useMemo(() => {
    const political = new Map<string, number | null>();
    const economic = new Map<string, number | null>();
    for (const p of points) {
      if (p.year !== year) continue;
      political.set(p.iso3, p.political);
      economic.set(p.iso3, p.economic);
    }
    return { political, economic };
  }, [points, year]);
  const moved = useMemo(() => (year == null || first == null || year <= first ? [] : movers(both, first, year)), [both, first, year]);
  const yearRange = useMemo(() => {
    const eligible = byYear.filter((b): b is { year: number; r: number; n: number } => b.r != null && b.n >= 8);
    if (!eligible.length) return null;
    const lo = eligible.reduce((a, b) => (b.r < a.r ? b : a));
    const hi = eligible.reduce((a, b) => (b.r > a.r ? b : a));
    const strongest = eligible.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
    return { lo, hi, strongest };
  }, [byYear]);

  const firstMean = useMemo(() => means.find((m) => m.year === first) ?? null, [means, first]);
  const lastMean = useMemo(() => means.find((m) => m.year === latest) ?? null, [means, latest]);

  if (index === undefined || year == null) return <InsightsSkeleton />;

  const version = meta?.quant_model?.method_version;
  const prov = (title: string, extra: Partial<Provenance> = {}): Provenance => ({
    title,
    layer: "model",
    tables: ["index", "index_component"],
    sources: SOURCES,
    lastYear: lastYearsFrom(meta, ["trade", "finance_CN", "finance_US", "debt_CN", "unga", "stance"]),
    model: { name: "Composite influence index: the economic-ties and political-alignment sub-indices", version: version ?? undefined, status: meta?.quant_model?.status === "computed" ? "computed on this release" : undefined, validation: "the sub-indices inherit the composite's normalisation (bounds over the whole panel) and its coverage; no validation against an external measure exists" },
    glossary: ["economic_ties", "political_alignment", "net_lean", "influence_index"],
    explore: { href: `/explore?view=index&index=economic_ties&year=${year}`, label: "Open the map on economic ties" },
    ...extra,
  });

  const noData = !index || index.layer !== "real" || both.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow">A question the record can settle</p>
        <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">Votes and ore</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2">
          The influence index has two halves. <Link href={glossaryHref("political_alignment")} className="glossary-term">Political alignment</Link> is built from UN General Assembly voting and, where enough records exist, legislative stance. <Link href={glossaryHref("economic_ties")} className="glossary-term">Economic ties</Link> are built from export and import shares, official finance and debt. The usual story says the second drags the first: a country that sells its ore to China ends up voting with Beijing. The record shows the vote came first.
        </p>
        {!noData && (
          <p className="mt-3 text-base leading-relaxed">
            Across <strong>{corr.n} country-years</strong> ({corr.countries} countries, {corr.from}–{corr.to}) the correlation between the economic lean and the political lean is <strong>r = {r2(corr.r)}</strong>.
            {yearRange && <> Year by year it runs from r = {r2(yearRange.lo.r)} ({yearRange.lo.year}) to r = {r2(yearRange.hi.r)} ({yearRange.hi.year}); the strongest reading of any sign is {yearRange.strongest.year} at r = {r2(yearRange.strongest.r)}{yearRange.strongest.r < 0 ? ", negative: that year the countries selling more to China voted less with it" : ""}.</>}
            {firstMean && lastMean && firstMean.political != null && firstMean.economic != null && lastMean.political != null && lastMean.economic != null && (
              <> In {firstMean.year} the political lean already averaged <strong>{fmtSigned(firstMean.political, 0)}</strong> toward China while the economic lean was <strong>{fmtSigned(firstMean.economic, 0)}</strong>{firstMean.economic < 0 ? " (the ore went to the United States)" : ""}; in {lastMean.year} the political lean is {fmtSigned(lastMean.political, 0)} and the economic lean {fmtSigned(lastMean.economic, 0)}. The trade crossed over; the votes stayed where they were.</>
            )}
          </p>
        )}
        <p className="mt-2 text-xs text-ink-3">
          Net lean = China index − United States index, in points of the 0–100 scale, for one sub-index and one country-year; it exists only where both actors have a value. Model outputs{version ? ` of method ${version}` : ""}; every figure is derived in the browser from the published index.
        </p>
      </header>

      {noData ? (
        <section className="card mt-6 px-4 py-4 sm:px-6">
          <p className="text-sm">{!index ? "The index could not be loaded; try again in a moment." : index.layer !== "real" ? "This release carries the seeded sample index, which has no sub-indices. The page fills once the computed index is published." : "The computed index carries no sub-index rows yet; they arrive with the next data release."}</p>
        </section>
      ) : (
        <>
          <SectionNav items={SECTIONS} />

          <Block id="maps" n={1} title={<>Two maps, one year</>} lead={<>The same countries, the same year, the same colour scale: the political lean on the left, the economic lean on the right.</>} layer="model" provenance={prov("Two maps, one year")}>
            <div className="mb-4 rounded-md border-2 border-outline bg-card px-3 py-2 shadow-[2px_2px_0_var(--shadow-hard)]">
              <YearControl year={year} onChange={changeYear} playing={playing} onTogglePlay={togglePlay} />
            </div>
            {features ? <LeanMaps features={features} year={year} political={yearMaps.political} economic={yearMaps.economic} theme={theme} /> : <p className="text-sm text-ink-3">Loading the map outlines…</p>}
            {split && (
              <p className="mt-3 text-sm leading-relaxed">
                {split.n === 0 ? (
                  <>No country has both sub-indices in {year}{latest ? `; the latest year with most of them is ${latest}` : ""}.</>
                ) : (
                  <>In {year}, <strong>{split.same} of {split.n}</strong> countries lean the same way on both measures and <strong>{split.opposite}</strong> lean opposite ways{split.mixed ? `; ${split.mixed} ${split.mixed === 1 ? "sits" : "sit"} within ±5 of balance on one axis` : ""}.</>
                )}
              </p>
            )}
          </Block>

          <Block id="quadrant" n={2} title={<>Where each country sits</>} lead={<>Economic lean across, political lean up. The corners are the four stories a country can tell; the faint line behind each dot is its path over the previous five years.</>} layer="model" provenance={prov("Where each country sits", { explore: { href: `/explore?view=index&index=political_alignment&year=${year}`, label: "Open the map on political alignment" } })} table={split ? <YearTable rows={split.byQuadrant} /> : undefined}>
            <QuadrantChart points={both} year={year} theme={theme} />
            {split && split.n > 0 && (
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {QUADRANTS.filter((q) => split.byQuadrant[q].length).map((q) => (
                  <li key={q} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: QUADRANT_COLOR[q] }} aria-hidden="true" />
                    <span><span className="font-semibold">{QUADRANT_LABEL[q]}</span> ({split.byQuadrant[q].length}): {split.byQuadrant[q].map((p) => p.name).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block id="movers" n={3} title={<>Who moved against their own trade</>} lead={<>Each country&apos;s two leans in {first} and in {year}, and how far apart they moved. A large number on the right means one measure moved and the other did not, or they went opposite ways.</>} layer="model" provenance={prov("Who moved against their own trade", { caveat: "The political lean is UN voting agreement for every country and year, legislative stance only where five or more scored records exist in a year; a swing in the political lean after an election is mostly a swing in the General Assembly record." })}>
            {moved.length ? <MoversTable rows={moved} /> : <p className="text-sm text-ink-3">No country has both leans in both {first} and {year}.</p>}
          </Block>

          <Block id="lines" n={4} title={<>Every country, both lines</>} lead={<>The political lean and the economic lean year by year, one small chart per country, on the same scale.</>} layer="model" provenance={prov("Every country, both lines")}>
            <p className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: AXIS_COLOR.political }} /> political alignment · net lean</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: AXIS_COLOR.economic }} /> economic ties · net lean</span>
              <span>a gap is a year without both actors&apos; values</span>
            </p>
            <Trajectories trajectories={paths} yearMin={corr.from ?? YEAR_MIN} yearMax={corr.to ?? YEAR_MAX} theme={theme} cols={cols} />
          </Block>

          <Block id="reading" n={5} title={<>What this does and does not show</>} layer="interpretation" provenance={{ title: "What this does and does not show", layer: "interpretation", tables: ["index", "index_component"], glossary: ["economic_ties", "political_alignment", "net_lean"], findingId: "votes_and_ore", caveat: "A reading of two model outputs. It can be wrong where the measures are thin: political alignment rests on UN voting almost everywhere, and economic ties on trade shares where finance and debt are absent." }}>
            <div className="prose-doc max-w-3xl text-sm leading-relaxed">
              <p><strong>What the two halves are.</strong> Political alignment: {INDEX_FORMULA.political_alignment}. Economic ties: {INDEX_FORMULA.economic_ties}. Both are normalised over the whole panel (every country, year and actor on one scale), so a lean of +30 means China&apos;s score is thirty points above the United States&apos; on that scale, not that a country votes with China thirty percent more often.</p>
              <p><strong>Why the political map looks the same every year.</strong> The General Assembly record has agreed with China about four times in five and with the United States about one time in three for every South American country since 2000. That pattern predates the mineral trade and has barely moved while the trade grew tenfold. It is the reason the composite index leaned China in 2000 on the evidence room&apos;s map.</p>
              <p><strong>What a weak correlation says, and what it does not.</strong> r = {r2(corr.r)} over {corr.n} country-years says the economic lean does not predict the political lean across this panel. It does not say that money never buys votes; the panel regressions in the Lab test narrower claims. It does not say the measures are perfect: political alignment is thin where legislative records are scarce, and economic ties are thin before 2007 for the United States, whose finance record starts then.</p>
              <p><strong>Where to argue.</strong> Every block has an evidence drawer with the tables, the sources and their last year. The &ldquo;argue with this reading&rdquo; link opens an issue with the exhibit named.</p>
            </div>
          </Block>
        </>
      )}
    </div>
  );
}

function YearTable({ rows }: { rows: Record<string, BothLean[]> }) {
  const all = Object.values(rows).flat().sort((a, b) => a.name.localeCompare(b.name));
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-left text-ink-3"><th className="py-1 pr-2 font-medium">Country</th><th className="py-1 pr-2 font-medium">Economic ties</th><th className="py-1 pr-2 font-medium">Political alignment</th><th className="py-1 font-medium">Corner</th></tr></thead>
      <tbody>
        {all.map((p) => (
          <tr key={p.iso3} className="border-t border-rule-2"><td className="py-1 pr-2">{p.name}</td><td className="py-1 pr-2 tabular-nums">{fmtSigned(p.economic, 0)}</td><td className="py-1 pr-2 tabular-nums">{fmtSigned(p.political, 0)}</td><td className="py-1">{QUADRANT_LABEL[quadrant(p.economic, p.political)]}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function MoversTable({ rows }: { rows: Mover[] }) {
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th className="py-1 pr-3 font-medium">Country</th>
            <th className="py-1 pr-3 font-medium">Economic ties {rows[0].from} → {rows[0].to}</th>
            <th className="py-1 pr-3 font-medium">Political alignment {rows[0].from} → {rows[0].to}</th>
            <th className="py-1 pr-3 font-medium">Moved apart by</th>
            <th className="py-1 font-medium">Reading in {rows[0].to}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.iso3} className="border-t border-rule-2 align-top">
              <td className="py-1.5 pr-3 font-semibold">{m.name}</td>
              <td className="py-1.5 pr-3 tabular-nums">{fmtSigned(m.economicFrom, 0)} → {fmtSigned(m.economicTo, 0)} <span className="text-ink-3">({fmtSigned(m.dEconomic, 0)})</span></td>
              <td className="py-1.5 pr-3 tabular-nums">{fmtSigned(m.politicalFrom, 0)} → {fmtSigned(m.politicalTo, 0)} <span className="text-ink-3">({fmtSigned(m.dPolitical, 0)})</span></td>
              <td className="py-1.5 pr-3 tabular-nums">{Math.abs(m.divergence).toFixed(0)} points</td>
              <td className="py-1.5 text-xs text-ink-2">{sideWord(m.economicTo, "economic")}, {sideWord(m.politicalTo, "political")}{m.quadrantFrom !== m.quadrantTo ? <span className="text-ink-3"> · in {m.from}: {sideWord(m.economicFrom, "economic")}, {sideWord(m.politicalFrom, "political")}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
