"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FitTarget } from "@/components/map/SouthAmericaMap";
import { LayerLabel } from "@/components/ui/Badges";
import { Reading } from "@/components/ui/Reading";
import { Skeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT, IN_SCOPE, YEAR_MAX, YEAR_MIN, countWord } from "@/lib/constants";
import { BIV, BIV_NAMES, buyerCells, bivFill } from "@/lib/buyers";
import { CLAIMS } from "@/lib/contested";
import { Picture, usePictures } from "@/components/ui/Picture";
import { loadFlows, loadIndex, loadMeta, loadRealMeta } from "@/lib/data";
import { fmtMusd, fmtPct, fmtSigned } from "@/lib/format";
import { latestYear, leanByYear, tradeByYear, type LeanYear, type TradeYear } from "@/lib/overview";
import { COURSE, COVER_VERSION, RESEARCH_QUESTION, SITE_NAME } from "@/lib/team";
import { useTheme } from "@/lib/theme";
import type { FlowsFile, IndexFile, Meta, RealMeta } from "@/lib/types";

const SouthAmericaMap = dynamic(() => import("@/components/map/SouthAmericaMap").then((m) => m.SouthAmericaMap), { ssr: false, loading: () => <Skeleton className="h-[26rem] w-full" /> });

const Kind = ({ k }: { k: "facts" | "model" | "interpretation" }) => <LayerLabel layer={k} />;

/** A tiny sparkline in the stat tile, drawn from the yearly values (gaps break the line). */
function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const xs = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (xs.length < 2) return null;
  const max = Math.max(...xs.map((p) => p[1])), min = Math.min(...xs.map((p) => p[1]));
  const w = 140, h = 28;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 2) + 1;
  const y = (v: number) => (max === min ? h / 2 : h - 2 - ((v - min) / (max - min)) * (h - 4));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="mt-1 block">
      <path d={xs.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")} fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx={x(xs[xs.length - 1][0])} cy={y(xs[xs.length - 1][1])} r="2.2" fill={color} />
    </svg>
  );
}

const DOORS = [
  { href: "/story", picture: "lithium_field", title: "Story", text: "What leaders said, what the money did: ten chapters of evidence, 2000–2026." },
  { href: "/explore", picture: "andes", title: "Explore the map", text: "Every country coloured by the index, money and trade arcs to Washington and Beijing, five tabs per country." },
  { href: "/routes", picture: "port", title: "Trade & Investment", text: "Where the region's minerals go, where the buyers get them, and the ceiling on the indirect route." },
  { href: "/mineral", picture: "copper_mine", title: "Minerals", text: "What each mineral is for, who has it, who buys it, where it is and what it costs." },
  { href: "/country", picture: "amazon", title: "Countries", text: "Twenty case files: actions, politics, media, analysis and forecast." },
  { href: "/contested", picture: "congress", title: "Against the grain", text: "Claims the usual story gets wrong, and two it gets right, each tested on the record with a verdict and what would overturn it." },
  { href: "/votes-and-ore", picture: "votes", title: "Balance of presence", text: "Votes against ore: where each power is present, in what form, and what the hypotheses say." },
];
const QUESTIONS = [
  { k: "H1", q: "Which announced projects were actually built?", href: "/stage#s-ladder" },
  { k: "$", q: "Who wrote the cheques: China or the US?", href: "/story#c4" },
  { k: "Li", q: "Where does the lithium triangle's lithium go?", href: "/mineral/lithium" },
  { k: "Ore", q: "Who buys the ore, and who buys the metal?", href: "/stage#s-trade" },
  { k: "Via", q: "How much reaches the US through Canada?", href: "/routes" },
  { k: "MX", q: "Why is Mexico the counter-case?", href: "/country/MEX" },
  { k: "Text", q: "Who talks about the rivalry, and who doesn't?", href: "/country/CHL?tab=politics" },
  { k: "Why", q: "Why does China keep its ground while Washington talks louder?", href: "/denial" },
];

/** The home, laid out as the team's prototype lays out its overview: the question, the map, four numbers, five ideas, three actors, the ways in. */
export function OverviewPage() {
  const [d, setD] = useState<{ flows: FlowsFile | null; index: IndexFile; meta: Meta; real: RealMeta | null } | null | undefined>(undefined);
  const theme = useTheme();
  useEffect(() => {
    let alive = true;
    Promise.all([loadFlows(), loadIndex(), loadMeta(), loadRealMeta()])
      .then(([flows, index, meta, real]) => { if (alive) setD({ flows: flows.layer === "real" ? flows.data : null, index, meta, real }); })
      .catch(() => alive && setD(null));
    return () => { alive = false; };
  }, []);
  const pictures = usePictures();
  const scope = useMemo(() => new Set(IN_SCOPE), []);
  const trade: TradeYear[] = useMemo(() => (d?.flows ? tradeByYear(d.flows.trade, scope) : []), [d, scope]);
  const lean: LeanYear[] = useMemo(() => (d ? leanByYear(d.index.rows, scope) : []), [d, scope]);
  const lastTrade = d?.flows?.meta.last_year.trade ?? YEAR_MAX;
  const t = latestYear(trade, lastTrade);
  const t0 = trade.find((y) => y.n_cn > 0 && y.n_us > 0) ?? null;
  const l = latestYear(lean, YEAR_MAX);
  // the hero map: each country's China and US shares of its own exports in the latest trade year with both cells
  const hero = useMemo(() => {
    if (!d?.flows || !t) return { fills: {} as Record<string, string | undefined>, values: {} as Record<string, number | null>, cells: new Map<string, { cn: number; us: number }>(), year: null as number | null };
    const year = t.year;
    const cells = buyerCells(d.flows.trade, year, "all", IN_SCOPE);
    const fills: Record<string, string | undefined> = {};
    const values: Record<string, number | null> = {};
    for (const iso of IN_SCOPE) {
      const c = cells.get(iso);
      fills[iso] = c ? bivFill(c.cn, c.us) : undefined;
      values[iso] = c ? c.cn - c.us : null;
    }
    return { fills, values, cells, year };
  }, [d, t]);
  const fit = useMemo<FitTarget>(() => ({ kind: "home" }), []);

  if (d === undefined) return <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-5"><Skeleton className="h-64 w-full" /></div>;
  if (!d) return <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-5 text-sm text-ink-2">The data files could not be loaded.</div>;
  const cnColor = "var(--cn)", usColor = "var(--us)";
  const withFacts = d.real ? Object.values(d.real.coverage).filter((c) => c.actions).length : null;
  // the tiles' reading compares the two ends of the share tiles it prints; without both ends it only says where to look
  const bothShares = t0 && t && t0.share_cn != null && t.share_cn != null && t0.share_us != null && t.share_us != null;
  const cnUp = bothShares && (t.share_cn as number) > (t0.share_cn as number);
  const usDown = bothShares && (t.share_us as number) < (t0.share_us as number);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 sm:px-5">
      {/* hero */}
      <section className="grid items-center gap-7 py-3 pb-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div>
          <p className="eyebrow">Research platform · {COURSE.school} · {COVER_VERSION.label}</p>
          <h1 className="mt-3 text-[clamp(2rem,4.2vw,3.25rem)] font-normal leading-[1.08]">How China and the United States compete for Latin America&apos;s <em className="italic">critical minerals</em>, and how the region responds</h1>
          <p className="mt-4 max-w-[60ch] text-[1.125rem] leading-snug text-ink-2"><strong className="font-medium text-ink">Research question:</strong> {RESEARCH_QUESTION}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip">{COUNTRY_COUNT} countries · {YEAR_MIN} to {YEAR_MAX}</span>
            <span className="chip">20 minerals in the registry</span>
            <span className="chip">Trade · finance · investment · votes · parliaments · press · statements</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/story" className="btn btn-md btn-primary no-underline">Read the story: Said &amp; Paid</Link>
            <Link href="/explore" className="btn btn-md no-underline">Explore the data</Link>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3 className="text-base">Who bought each country&apos;s critical minerals{hero.year ? `, ${hero.year}` : ""}</h3><Kind k="facts" /></div>
          <Reading compact asks="Who buys each country's minerals? The home opens with the buyers because everything the site asks follows from that trade, and a map shows the split for every country at once." how="Each country is coloured on a three-by-three grid: China's share runs across, the US share runs up, so both high and both low keep their own colour; hover a country for its two shares. Grey is no reported export cells for the two buyers, which is missing data and not an absence of trade." />
          <div className="relative h-[24rem] overflow-hidden rounded-md border border-rule">
            <SouthAmericaMap fills={hero.fills} values={hero.values} countries={d.meta.countries} selection={[]} onSelect={() => undefined} onHover={() => undefined} describeValue={(iso) => { const c = hero.cells.get(iso); return c ? `${fmtPct(c.cn, 0)} to China, ${fmtPct(c.us, 0)} to the United States` : "no reported export cells"; }} theme={theme} worldUrl="/data/world.topo.json" fitTo={fit} animateFlows={false} />
            <div className="absolute right-2 top-2 rounded-md border border-rule bg-card/95 p-2 text-[10px] text-ink-3">
              <div className="grid grid-cols-3 gap-px" aria-label="Legend: China's share across, the US share down">
                {[2, 1, 0].map((u) => [0, 1, 2].map((c) => <span key={`${u}${c}`} title={BIV_NAMES[u][c]} className="block h-3.5 w-3.5" style={{ background: BIV[u][c] }} />))}
              </div>
              <div className="mt-1 leading-tight">China&apos;s share →<br />US share ↑</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">Shares of each country&apos;s reported exports of the tracked minerals; low is under 15%, high over 40%. Source: UN Comtrade, own calculations.</p>
          <Reading compact says={`${t && t.share_cn != null && t.share_us != null ? `Over the region ${fmtPct(t.share_cn, 0)} of the tracked exports went to China and ${fmtPct(t.share_us, 0)} to the United States in ${t.year}; ` : ""}look for the countries whose colour sits in a corner of the legend, where the ore goes mostly to one buyer or to neither.`} saysKind="facts" />
        </div>
      </section>

      {/* four numbers */}
      <section className="mt-2">
        <h2 className="text-[1.45rem]">The region in four numbers</h2>
        <Reading compact asks="How big is the shift the site is about? Four numbers, each with a sparkline, give the region's totals over the whole record before any single country is opened." how="Each tile shows the first year with both buyers reported and the latest, the sparkline every year between; the first three sum reported exports over the reporting countries, the fourth averages a model output. A break in a sparkline is a missing year, not a zero." />
        <div className="mt-3 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="stat">
            <div className="k">China&apos;s share of the region&apos;s mineral exports</div>
            <div className="v text-cn">{t0 && t0.share_cn != null ? fmtPct(t0.share_cn, 1) : "—"} <small className="text-base text-ink-3">→</small> {t && t.share_cn != null ? fmtPct(t.share_cn, 1) : "—"}</div>
            <Spark values={trade.map((y) => y.share_cn)} color={cnColor} />
            <div className="s">{t0?.year ?? YEAR_MIN} → {t?.year ?? "—"} · reported exports summed over the reporting countries</div>
          </div>
          <div className="stat">
            <div className="k">US share of the same exports</div>
            <div className="v text-us">{t0 && t0.share_us != null ? fmtPct(t0.share_us, 1) : "—"} <small className="text-base text-ink-3">→</small> {t && t.share_us != null ? fmtPct(t.share_us, 1) : "—"}</div>
            <Spark values={trade.map((y) => y.share_us)} color={usColor} />
            <div className="s">{t0?.year ?? YEAR_MIN} → {t?.year ?? "—"} · UN Comtrade</div>
          </div>
          <div className="stat">
            <div className="k">Value of those exports</div>
            <div className="v">{t0?.WLD != null ? fmtMusd(t0.WLD) : "—"} <small className="text-base text-ink-3">→</small> {t?.WLD != null ? fmtMusd(t.WLD) : "—"}</div>
            <Spark values={trade.map((y) => y.WLD)} color="var(--ink)" />
            <div className="s">current US$ · mostly price-driven</div>
          </div>
          <div className="stat">
            <div className="k">Net lean of the influence index</div>
            <div className="v">{l && l.net != null ? fmtSigned(l.net, 0) : "—"} <small className="text-base text-ink-3">in {l?.year ?? "—"}</small></div>
            <Spark values={lean.map((y) => y.net)} color="var(--ink-2)" />
            <div className="s">mean of China minus US over {l?.n ?? "—"} countries · model output</div>
          </div>
        </div>
        <Reading compact says={`${cnUp && usDown ? "Between the two years on the tiles China's share rose and the US share fell" : "Compare the two ends of each share tile"}; the value tile is in current dollars, so much of its movement is prices, and the lean tile is a model output, not a trade figure.`} />
      </section>

      {/* the arguments */}
      <section className="mt-9">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[1.45rem]">{countWord(CLAIMS.length, true)} claims against the grain</h2>
            <p className="mt-1 max-w-[70ch] text-sm text-ink-2">The data describes; these claims argue. Each cuts against the usual story of the rivalry and is tested on the record when the arguments page loads: the test, the numbers, a verdict by a stated rule, and what would overturn it.</p>
          </div>
          <Link href="/contested" className="btn btn-md btn-primary no-underline">Read the tests and verdicts</Link>
        </div>
        <ol className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {CLAIMS.map((c, i) => (
            <li key={c.id}>
              <Link href={`/contested#${c.id}`} className="card flex h-full items-start gap-3 p-3 no-underline hover:bg-surface-2">
                <span className="font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block text-[0.95rem] font-semibold leading-snug text-ink">{c.headline}</span>
                  <span className="mt-0.5 block text-[0.78rem] text-ink-2">{c.stake}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-ink-3"><LayerLabel layer="interpretation" /> The claims are the team&apos;s reading, AI-drafted; the numbers behind each verdict are computed from the data files and labelled on the page.</p>
      </section>

      {/* three actors */}
      <section className="mt-9">
        <h2 className="text-[1.45rem]">Three actors, not two</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-2">Latin American governments set the rules, choose partners and bargain over terms. The site treats them as actors in every section, not as the stage on which two powers compete.</p>
        <div className="max-w-2xl">
          <Reading compact asks="Why three actors and not two? A diagram of the links makes the point that the region's governments sit on every tie the site measures, rather than between the two powers." how="China and the United States above, the governments below; each coloured line is the ties one power holds with the region, the dashed line between the powers their rivalry; the words in the middle name what every link carries." />
        </div>
        <div className="panel mt-3 max-w-2xl">
          <svg viewBox="0 0 520 230" className="h-auto w-full" role="img" aria-label="China and the United States above, Latin American governments below, each link carrying trade, investment and finance, diplomacy and narratives">
            <defs><marker id="arrow-ov" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--ink-3)" /></marker></defs>
            <line x1="130" y1="62" x2="245" y2="178" stroke="var(--cn)" strokeWidth="1.5" />
            <line x1="390" y1="62" x2="275" y2="178" stroke="var(--us)" strokeWidth="1.5" />
            <line x1="175" y1="40" x2="345" y2="40" stroke="var(--rule-2)" strokeWidth="1" strokeDasharray="4 3" />
            <text x="260" y="33" textAnchor="middle" fontSize="10" fill="var(--ink-3)">strategic competition</text>
            <rect x="40" y="18" width="135" height="44" rx="8" fill="var(--card)" stroke="var(--cn)" strokeWidth="1.5" />
            <text x="107" y="37" textAnchor="middle" fontSize="13" fill="var(--ink)">China</text>
            <text x="107" y="53" textAnchor="middle" fontSize="9.5" fill="var(--ink-3)">buys, lends, then owns</text>
            <rect x="330" y="18" width="165" height="44" rx="8" fill="var(--card)" stroke="var(--us)" strokeWidth="1.5" />
            <text x="412" y="37" textAnchor="middle" fontSize="13" fill="var(--ink)">United States</text>
            <text x="412" y="53" textAnchor="middle" fontSize="8.5" fill="var(--ink-3)">market, dollar, security, pressure</text>
            <text x="260" y="104" textAnchor="middle" fontSize="9.5" fill="var(--ink-3)">each link carries</text>
            <text x="260" y="118" textAnchor="middle" fontSize="9.5" fill="var(--ink-2)">trade</text>
            <text x="260" y="131" textAnchor="middle" fontSize="9.5" fill="var(--ink-2)">investment &amp; finance</text>
            <text x="260" y="144" textAnchor="middle" fontSize="9.5" fill="var(--ink-2)">diplomacy &amp; narratives</text>
            <rect x="120" y="178" width="280" height="44" rx="8" fill="var(--sand)" stroke="var(--sand-ink)" strokeWidth="1.5" />
            <text x="260" y="197" textAnchor="middle" fontSize="13" fill="var(--ink)">Latin American governments</text>
            <text x="260" y="213" textAnchor="middle" fontSize="8.5" fill="var(--sand-ink)">{COUNTRY_COUNT} states setting rules, choosing partners, hedging</text>
          </svg>
        </div>
        <div className="max-w-2xl">
          <Reading compact says="The site's framing, not a finding: every chart that follows reads trade, money and words as choices the region's governments make too, which is why the case files and the statements get as much room as the flows." />
        </div>
      </section>

      {/* five ways in */}
      <section className="mt-9">
        <h2 className="text-[1.45rem]">Ways in</h2>
        <div className="mt-3 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {DOORS.map((x) => (
            <Link key={x.href} href={x.href} className="card door-picture grid content-start gap-2 overflow-hidden p-0 no-underline">
              <Picture id={x.picture} pictures={pictures} ratio="card" bare />
              <div className="grid gap-2 px-4 pb-4 pt-2">
              <h3 className="text-[1.05rem]">{x.title}</h3>
              <p className="serif text-[0.9rem] italic text-ink-2">{x.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* questions */}
      <section className="mt-9">
        <h2 className="text-[1.45rem]">Start with a question</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTIONS.map((q) => (
            <Link key={q.q} href={q.href} className="chip h-auto py-1.5 no-underline hover:border-ink-3"><span className="font-mono text-[10px] text-ink-3">{q.k}</span>{q.q}</Link>
          ))}
        </div>
      </section>

      {/* story band */}
      <section className="mt-9 rounded-xl bg-ink px-5 py-5 text-surface sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="text-[1.45rem] text-surface">Said &amp; Paid: the story in ten chapters</h2>
          <p className="mt-1 max-w-[60ch] text-sm opacity-85">The whole picture first, then what leaders said and what the money did, country by country, with the record at each turn and a verdict at the end. About fifteen minutes; every exhibit opens its evidence.</p>
        </div>
        <Link href="/story" className="btn btn-md mt-3 shrink-0 border-surface bg-surface text-ink no-underline sm:mt-0">Read the story</Link>
      </section>

      {/* how we know */}
      <section className="mt-9 grid gap-5 border-t border-rule pt-5 sm:grid-cols-3">
        <div>
          <h3 className="text-base">Our data</h3>
          <p className="mt-1 text-sm text-ink-2">Trade, finance, investment, debt, UN votes, legislative and press records from {d.real ? `${d.real.sources_ok.length} live sources` : "the registry"}, ingested by a pipeline that keeps every source&apos;s reliability rating and, from October 2026, CEPII BACI&apos;s reconciled bilateral trade.{withFacts != null ? ` ${withFacts} of ${COUNTRY_COUNT} countries carry facts in this release.` : ""}</p>
        </div>
        <div>
          <h3 className="text-base">Companion datasets</h3>
          <p className="mt-1 text-sm text-ink-2">Dated events, the project ladder, the pressure cases and leaders&apos; statements come from the companion projects <Link href="/denial" className="underline">Denial without Substitution</Link> and the team&apos;s <Link href="/stage" className="underline">prototype</Link>. Each record keeps its source.</p>
        </div>
        <div>
          <h3 className="text-base">Limits</h3>
          <p className="mt-1 text-sm text-ink-2">Shares describe associations, not causes. Prices drive most value changes. Missing data are shown as missing, never as zero. Model outputs and interpretation are labelled on every block. <Link href="/methodology" className="underline">Methods &amp; Data</Link>.</p>
        </div>
      </section>
      <p className="mt-6 text-xs text-ink-3">{SITE_NAME} is a research platform of {COURSE.name}, {COURSE.school}, {COURSE.year}.</p>
    </div>
  );
}
