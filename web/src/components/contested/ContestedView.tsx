"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LayerLabel } from "@/components/ui/Badges";
import { PageGuide } from "@/components/ui/Reading";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT_WORD, COUNTRY_NAMES, IN_SCOPE } from "@/lib/constants";
import { attentionVsMoney, capitalVsOre, lendingVsOre, mineralSplit, panelNull, pressureCases, talkPattern, turnSummary, turnsVsOre, votesVsOre, VERDICT_LABEL, type Turn, type Verdict } from "@/lib/contested";
import { loadComponents, loadFlows, loadInsights, loadInvestment, loadRegionShares, loadRoutes } from "@/lib/data";
import { fmtMusd, fmtPct, fmtShare, fmtSigned } from "@/lib/format";
import { economyName, indirectFor, latestRouteYear } from "@/lib/routes";
import { loadStage } from "@/lib/stage";
import type { ComponentsFile } from "@/lib/geometry";
import type { RoutesFile } from "@/lib/routes";
import type { StageRecords } from "@/lib/stage";
import type { FlowsFile, InsightsFile, InvestmentFile, MineralShareRow } from "@/lib/types";

interface Data { flows: FlowsFile; flowsLayer: "real" | "sample"; insights: InsightsFile | null; investment: InvestmentFile | null; shares: MineralShareRow[]; components: ComponentsFile | null; rec: StageRecords | null; routes: RoutesFile | null }

const name = (iso: string) => COUNTRY_NAMES[iso] ?? iso;
const pp = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} pts`;
const ORI: Record<string, string> = { L: "left", C: "centre", R: "right" };

/** One claim against the grain: the usual story, the test, the record, the verdict, what would overturn it. */
function Claim({ n, id, headline, verdict, matters, usual, test, record, soWhat, overturn, links, children }: { n: number; id: string; headline: ReactNode; verdict: Verdict; matters: ReactNode; usual: ReactNode; test: ReactNode; record: { text: ReactNode; kind: "facts" | "model" }[]; soWhat: ReactNode; overturn: ReactNode; links: { href: string; label: string }[]; children?: ReactNode }) {
  return (
    <section id={id} className="card mt-5 scroll-mt-14 px-4 py-4 sm:px-6 sm:py-5" aria-labelledby={`${id}-h`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="eyebrow">{String(n).padStart(2, "0")}</p>
          <h2 id={`${id}-h`} className="serif mt-0.5 text-xl font-bold leading-tight sm:text-2xl">{headline}</h2>
        </div>
        <span className={`verdict verdict-${verdict}`}>{VERDICT_LABEL[verdict]}</span>
      </div>
      <p className="claim-matters mt-2 max-w-3xl text-sm leading-relaxed text-ink-2"><span className="reading-label">Why it matters</span> {matters}</p>
      <dl className="claim-grid mt-3">
        <dt>The usual story</dt>
        <dd>{usual}</dd>
        <dt>The test</dt>
        <dd>{test}</dd>
        <dt>The record</dt>
        <dd>
          <ul className="space-y-1">
            {record.map((r, i) => (
              <li key={i}>{r.text} <LayerLabel layer={r.kind} /></li>
            ))}
          </ul>
          {children}
        </dd>
        <dt>So what</dt>
        <dd>{soWhat} <LayerLabel layer="interpretation" /></dd>
        <dt>What would overturn it</dt>
        <dd>{overturn}</dd>
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="underline decoration-dotted">{l.label} →</Link>
        ))}
      </p>
    </section>
  );
}

/** Tiny bars by year, for a series that must be read as a shape. */
function Bars({ rows, max, color }: { rows: { year: number; v: number }[]; max: number; color: string }) {
  const w = 10, gap = 3, h = 44;
  return (
    <svg width={rows.length * (w + gap)} height={h + 14} role="img" aria-label="Bars by year" className="mt-2 block max-w-full">
      {rows.map((r, i) => {
        const bh = max > 0 ? Math.max(1, (r.v / max) * h) : 1;
        return <rect key={r.year} x={i * (w + gap)} y={h - bh} width={w} height={bh} fill={color} rx={1}><title>{`${r.year}: ${fmtMusd(r.v)}`}</title></rect>;
      })}
      {rows.filter((r) => r.year % 5 === 0).map((r) => (
        <text key={`t${r.year}`} x={rows.indexOf(r) * (w + gap)} y={h + 11} fontSize="9" fill="var(--ink-3)">{r.year}</text>
      ))}
    </svg>
  );
}

export function ContestedView() {
  const [d, setD] = useState<Data | null | undefined>(undefined);
  useEffect(() => {
    Promise.all([loadFlows(), loadInsights(), loadInvestment(), loadRegionShares(), loadComponents(), loadStage(), loadRoutes()])
      .then(([f, ins, inv, sh, comp, stage, routes]) => setD({ flows: f.data, flowsLayer: f.layer, insights: ins, investment: inv, shares: sh.rows, components: comp, rec: stage?.rec ?? null, routes }))
      .catch(() => setD(null));
  }, []);

  const turns = useMemo(() => (d?.rec ? turnsVsOre(d.rec.TERMS, d.flows.trade, IN_SCOPE) : []), [d]);
  const ts = useMemo(() => turnSummary(turns), [turns]);
  const lend = useMemo(() => (d ? lendingVsOre(d.flows.finance, d.flows.trade, IN_SCOPE) : null), [d]);
  const cap = useMemo(() => (d?.investment ? capitalVsOre(d.investment) : null), [d]);
  const minerals = useMemo(() => (d?.shares.length ? mineralSplit(d.shares) : null), [d]);
  const panel = useMemo(() => (d?.insights ? panelNull(d.insights.region.regressions.rows) : null), [d]);
  const votes = useMemo(() => (d?.components ? votesVsOre(d.components.components) : null), [d]);
  const talk = useMemo(() => (d?.insights ? talkPattern(d.insights.region) : null), [d]);
  const att = useMemo(() => (d?.insights ? attentionVsMoney(d.insights.region.attention) : null), [d]);
  const cases = useMemo(() => (d?.rec ? pressureCases(d.rec.CASES) : null), [d]);
  const route = useMemo(() => {
    if (!d?.routes) return null;
    const year = latestRouteYear(d.routes, "USA", "all");
    if (year == null) return null;
    const ind = indirectFor(d.routes, "USA", "all", year);
    return { year, direct: ind.direct != null && ind.world ? ind.direct / ind.world : null, bound: ind.world ? ind.bound_total / ind.world : null, top: ind.legs.find((l) => l.bound != null) ?? null, world: ind.world };
  }, [d]);

  if (d === undefined) return <InsightsSkeleton />;
  if (!d) return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-ink-2">The data files could not be loaded.</div>;

  // verdicts are computed from the record, so a new data release can change them
  const vTurns: Verdict = ts.tested < 6 ? "open" : (ts.right.mean ?? 0) > 0 && (ts.left.mean ?? 0) > 0 ? "holds" : (ts.right.mean ?? 0) < 0 && (ts.left.mean ?? 0) > 0 ? "fails" : "part";
  const peakShare = lend?.peak?.share_cn ?? null, lastShare = lend?.lastCN?.share_cn ?? null;
  const vLend: Verdict = lend?.peak && lend.lastCN && peakShare != null && lastShare != null ? (lend.lastCN.CN < lend.peak.CN / 2 && lastShare > peakShare ? "holds" : lend.lastCN.CN < lend.peak.CN / 2 ? "part" : "fails") : "open";
  const vCap: Verdict = cap?.USA && cap.CHN ? (cap.USA.musd > 10 * cap.CHN.musd ? "holds" : cap.USA.musd > cap.CHN.musd ? "part" : "fails") : "open";
  const lithium = minerals?.rows.find((r) => r.mineral === "lithium") ?? null;
  const vMin: Verdict = minerals ? (minerals.usLed.length > 0 && minerals.chinaLed.length > 0 ? "holds" : "fails") : "open";
  const vPanel: Verdict = panel ? (panel.rows.length === 0 ? "open" : panel.significant.length === 0 ? "holds" : "fails") : "open";
  const vVotes: Verdict = votes && votes.rows.length ? (Math.abs(votes.correlation ?? 1) < 0.3 && votes.lowTradeHighVotes.length * 2 >= votes.rows.length ? "holds" : Math.abs(votes.correlation ?? 1) < 0.5 ? "part" : "fails") : "open";
  const vTalk: Verdict = talk?.ratios.statements_us_over_cn != null && talk.ratios.money_cn_over_us_2015_21 != null ? (talk.ratios.statements_us_over_cn > 1 && talk.ratios.money_cn_over_us_2015_21 > 1 ? "holds" : "fails") : "open";
  const neither = talk?.latam ? Math.min(talk.latam.neitherCn, talk.latam.neitherUs) / talk.latam.n : null;
  const vHedge: Verdict = neither != null ? (neither > 0.5 ? "holds" : neither > 0.3 ? "part" : "fails") : "open";
  const vAtt: Verdict = att?.peakDocs && att.peakMoney ? (att.peakDocs.year > att.peakMoney.year + 2 && (att.corr ?? 1) < 0.2 ? "holds" : att.peakDocs.year > att.peakMoney.year ? "part" : "fails") : "open";
  const vCases: Verdict = cases ? (cases.removed > 0 && cases.altFull === 0 ? (cases.documented <= 1 ? "part" : "holds") : "fails") : "open";
  const sample = d.flowsLayer === "sample";

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-6 sm:px-6">
      <p className="eyebrow">Against the grain</p>
      <h1 className="serif mt-1 text-3xl font-bold leading-tight sm:text-4xl">Ten claims the usual story gets wrong, or not quite right</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">The rest of the site describes and forecasts. This page argues. Each claim below cuts against a common account of the rivalry, and each is tested on this site&apos;s own record: the test is stated, the numbers are computed from the data files when the page loads, and the verdict follows a rule written next to it, so a new data release can change it. The wording of the claims is the team&apos;s, AI-drafted and labelled interpretation; the numbers are facts or model outputs and carry their labels.</p>
      <PageGuide purpose="The arguments: what the record says against the usual story of the rivalry, with the test and the verdict for each claim." read="Read the headline, then the record; the verdict is a rule applied to the numbers, and the last line says what evidence would overturn it. Every claim links to the exhibit that holds the detail." next={[{ href: "/story", label: "The story, chapter by chapter" }, { href: "/lab", label: "Test your own scenario" }, { href: "/what-we-know", label: "What the literature says" }]} />
      {sample && <p className="mt-2 rounded-md border border-sample/40 bg-sample/10 px-3 py-2 text-sm text-sample">Sample data: the verdicts below are computed on the sample set and mean nothing until the first data run.</p>}

      <Claim
        n={1}
        id="turns"
        headline="Elections did not change the buyer: China's share rose after right turns as much as after left turns"
        verdict={vTurns}
        matters="If elections do not move the ore, then the policy bet that a friendlier government in Buenos Aires or Brasília will bring minerals to the United States is a bet on something the record has never shown. For the region it means the buyer is a structural fact, not a political choice to be rewarded or punished."
        usual="A government that turns right sends its minerals toward the United States; one that turns left sends them toward China."
        test={`Every change of government that changed the coded orientation in the six focus countries (the prototype's terms): China's share of the country's reported exports in the three years after the inauguration minus the three before, and the same change net of the region's own move. ${ts.tested} turns can be measured, ${ts.untested} cannot (not enough reported years on one side).`}
        record={[
          { text: `Turns to the right: ${ts.right.n}; China's share rose after ${ts.right.up} of them; mean change ${ts.right.mean != null ? pp(ts.right.mean) : "—"}${ts.right.meanNet != null ? `, net of the region ${pp(ts.right.meanNet)}` : ""}.`, kind: "facts" as const },
          { text: `Turns to the left: ${ts.left.n}; China's share rose after ${ts.left.up}; mean change ${ts.left.mean != null ? pp(ts.left.mean) : "—"}${ts.left.meanNet != null ? `, net of the region ${pp(ts.left.meanNet)}` : ""}.`, kind: "facts" as const },
        ]}
        soWhat={(ts.right.mean ?? 0) > 0 ? "The buyer of the ore is set by mines, smelters and prices, not by the colour of the government. A right-wing turn that wanted to redirect exports toward the United States had nothing to redirect them with: the smelters are in China." : "On this record the direction of the turn and the direction of the ore do move together; the table says where."}
        overturn="A majority of right turns followed by a fall in China's share net of the region, or a left turn followed by a rise that the region did not share. Prices and mine openings move in the same years, so a single case proves nothing either way."
        links={[{ href: "/stage#s-timeline", label: "The politics track, six countries" }, { href: "/story#c8-index", label: "Argentina's index under Milei" }, { href: "/explore?view=buyers", label: "Who buys, on the map" }]}
      >
        {turns.length > 0 && (
          <div className="scroll-x mt-2">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ink-3"><th className="py-1 pr-3">Country</th><th className="py-1 pr-3">Year</th><th className="py-1 pr-3">Government</th><th className="py-1 pr-3">Turn</th><th className="py-1 pr-3 text-right">Before</th><th className="py-1 pr-3 text-right">After</th><th className="py-1 pr-3 text-right">Change</th><th className="py-1 text-right">Net of region</th></tr></thead>
              <tbody>
                {turns.map((t: Turn) => (
                  <tr key={`${t.iso3}${t.year}`} className="border-t border-rule">
                    <td className="py-1 pr-3">{name(t.iso3)}</td><td className="py-1 pr-3 tabular-nums">{t.year}</td><td className="py-1 pr-3">{t.name}</td><td className="py-1 pr-3">{ORI[t.from]} → {ORI[t.to]}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{t.before != null ? fmtPct(t.before, 0) : "—"}</td><td className="py-1 pr-3 text-right tabular-nums">{t.after != null ? fmtPct(t.after, 0) : "—"}</td>
                    <td className={`py-1 pr-3 text-right tabular-nums ${t.change != null && t.change > 0 ? "text-cn" : t.change != null && t.change < 0 ? "text-us" : ""}`}>{t.change != null ? pp(t.change) : "—"}</td><td className="py-1 text-right tabular-nums">{t.net != null ? pp(t.net) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-ink-3">Shares of each country&apos;s own reported exports (UN Comtrade); a dash means fewer than two reported years on that side. Orientation and terms are the prototype&apos;s coding.</p>
          </div>
        )}
      </Claim>

      <Claim
        n={2}
        id="lending"
        headline="The money left; the ore kept coming"
        verdict={vLend}
        matters="The debt-trap story is the main argument for treating Chinese finance as the lever of Chinese influence. If the trade grew while the lending collapsed, the lever and the influence are different things, and cutting off the loans would not cut off the ore."
        usual="China buys influence and resources with loans: the lending and the trade move together."
        test="Documented Chinese commitments to the twenty countries by year (AidData), against China's share of the region's reported mineral exports in the same years."
        record={[
          { text: lend?.peak ? `Chinese commitments peaked at ${fmtMusd(lend.peak.CN)} in ${lend.peak.year}${peakShare != null ? `, when China took ${fmtPct(peakShare, 0)} of the region's reported mineral exports` : ""}.` : "No Chinese commitments in the file.", kind: "facts" as const },
          { text: lend?.lastCN ? `In ${lend.lastCN.year}, the last year the source covers, commitments were ${fmtMusd(lend.lastCN.CN)}${lastShare != null ? ` and China's share of the ore ${fmtPct(lastShare, 0)}` : ""}.` : "", kind: "facts" as const },
          { text: lend?.lastCN ? `US DFC and EXIM commitments in ${lend.lastCN.year}: ${fmtMusd(lend.lastCN.US)}.` : "", kind: "facts" as const },
        ].filter((r) => r.text)}
        soWhat="If lending bought the ore, the ore would have followed the money down. It did not: China's purchases are a market position, and the loans were a separate, shorter episode that ended before the trade peaked. The debt-trap story and the resource-grab story are two stories, not one."
        overturn="A revival of Chinese lending that the trade then follows, or a fall in China's share of the ore in the years the lending fell. The AidData series ends where the record says; later lending is not visible."
        links={[{ href: "/story#c3-iceberg", label: "The Iceberg: two ledgers" }, { href: "/story#c4-flags", label: "Loan arrives, line stays flat" }, { href: "/lab#panel", label: "The panel regression" }]}
      >
        {lend && lend.rows.length > 0 && <Bars rows={lend.rows.map((r) => ({ year: r.year, v: r.CN }))} max={Math.max(...lend.rows.map((r) => r.CN))} color="var(--cn)" />}
      </Claim>

      <Claim
        n={3}
        id="capital"
        headline="China buys the ore; the capital in the ground is American"
        verdict={vCap}
        matters="Who owns the mines decides who sets the terms, pays the taxes and takes the profits. If the ownership is American while the customer is Chinese, each power is strong where the other is absent, and a policy aimed at only one of the two measures misreads the balance."
        usual="China has bought up Latin America's mining sector."
        test="Reported inward direct-investment positions held by each counterpart (IMF DIP), summed over the countries that report them, in the latest year both counterparts are reported."
        record={[
          { text: cap?.USA && cap.CHN ? `${cap.year}: positions held by the United States ${fmtMusd(cap.USA.musd)} across ${cap.USA.n} reporting countries; by mainland China ${fmtMusd(cap.CHN.musd)} across ${cap.CHN.n}${cap.HKG ? `; by Hong Kong SAR ${fmtMusd(cap.HKG.musd)} across ${cap.HKG.n}` : ""}.` : "The investment file is not in this release.", kind: "facts" as const },
          { text: "These are all-sector positions: the IMF series does not split mining out, and a Chinese stake held through a third economy is counted under that economy.", kind: "facts" as const },
        ]}
        soWhat="The two powers hold different kinds of presence: China is the customer, the United States the shareholder. A policy that counts only the ore sees China winning; one that counts only the balance sheet sees the opposite. Both are looking at the same region."
        overturn="Mining-only positions showing Chinese ownership of the producing assets, or positions routed through Hong Kong and the Caribbean that, once attributed, close the gap."
        links={[{ href: "/story#c0-investment", label: "Who owns the capital" }, { href: "/routes", label: "Trade and investment" }]}
      />

      <Claim
        n={4}
        id="minerals"
        headline={minerals && lithium ? `The battery metal is China's; the United States buys ${minerals.usLed[0] ? minerals.usLed[0].mineral.replace(/_/g, " ") : "something else"}` : "Who buys which mineral"}
        verdict={vMin}
        matters="A rivalry over the same minerals would mean a bidding war that the host countries could play on. Two different shopping lists mean the opposite: each power can be squeezed only on the minerals it actually buys, and the region's leverage is mineral by mineral, not bloc by bloc."
        usual="The two powers compete for the same critical minerals."
        test={`China's and the US's shares of the region's reported exports, mineral by mineral, in ${minerals?.year ?? "the latest year"} (UN Comtrade, the countries reporting that year).`}
        record={minerals ? [
          { text: `China leads in ${minerals.chinaLed.length} of ${minerals.rows.length} minerals: ${minerals.chinaLed.map((r) => `${r.mineral.replace(/_/g, " ")} ${fmtShare(r.share_cn)} vs ${fmtShare(r.share_us)}`).join(", ")}.`, kind: "facts" as const },
          { text: `The United States leads in ${minerals.usLed.length}: ${minerals.usLed.map((r) => `${r.mineral.replace(/_/g, " ")} ${fmtShare(r.share_us)} vs ${fmtShare(r.share_cn)}`).join(", ") || "none"}.`, kind: "facts" as const },
        ] : [{ text: "No mineral shares in this release.", kind: "facts" as const }]}
        soWhat="They are not buying the same things. China takes the ores that feed its smelters and battery plants; the United States takes the metals its own industry still refines. The rivalry over Latin American minerals is, in the trade data, mostly two shopping lists that barely overlap."
        overturn="US purchases of lithium, copper concentrate or rare-earth ores rising to a comparable share, or Chinese purchases of silver and graphite doing the same."
        links={[{ href: "/mineral", label: "The mineral case files" }, { href: "/region#min-h", label: "Mineral by mineral, by year" }]}
      >
        {minerals && (
          <div className="scroll-x mt-2">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ink-3"><th className="py-1 pr-3">Mineral</th><th className="py-1 pr-3 text-right">To China</th><th className="py-1 pr-3 text-right">To the US</th><th className="py-1 text-right">Reporters</th></tr></thead>
              <tbody>{minerals.rows.map((r) => <tr key={r.mineral} className="border-t border-rule"><td className="py-1 pr-3">{r.mineral.replace(/_/g, " ")}</td><td className="py-1 pr-3 text-right tabular-nums text-cn">{fmtShare(r.share_cn)}</td><td className="py-1 pr-3 text-right tabular-nums text-us">{fmtShare(r.share_us)}</td><td className="py-1 text-right tabular-nums">{"n_reporters" in r ? String((r as { n_reporters?: number }).n_reporters ?? "—") : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Claim>

      <Claim
        n={5}
        id="panel"
        headline="Nothing either power does shows up in the ore"
        verdict={vPanel}
        matters="Both capitals justify their finance, diplomacy and governance programmes partly as ways to shape where the region's minerals go. If none of these levers is detectable in the ore, the programmes need another justification, or a longer horizon than the record covers."
        usual="Finance, diplomacy and governance shape where a country's minerals go."
        test={`A panel regression of China's share of each country's exports on last year's Chinese finance, UN-vote alignment, electoral democracy, rule of law and mineral rents, with country and year fixed effects${panel?.n_obs ? ` (${panel.n_obs} country-years, ${panel.n_countries} countries, ${panel.years})` : ""}; wild-cluster p-values.`}
        record={panel && panel.rows.length ? panel.rows.map((r) => ({ text: `${r.term.replace(/_/g, " ")}: ${fmtSigned((r.coef ?? 0) * 100, 1)} share points per standard deviation, p = ${r.p_wild?.toFixed(2) ?? "—"}.`, kind: "model" as const })) : [{ text: "No panel in this release.", kind: "model" as const }]}
        soWhat={vPanel === "holds" ? "None of the levers the two capitals pull is detectable in the ore at this sample size. That is not proof they do nothing; it is proof that whatever they do is small next to geology and prices, which the fixed effects absorb." : "At least one lever is detectable in the ore; the rows above say which, and the Lab's panel block shows its size."}
        overturn="A longer panel, or mineral-level outcomes, finding a coefficient that survives dropping any one country. The jackknife ranges in the Lab say how far each coefficient moves when one country leaves."
        links={[{ href: "/lab#panel", label: "The panel block, with the jackknife" }, { href: "/methodology#events", label: "Event studies and panels" }]}
      />

      <Claim
        n={6}
        id="votes"
        headline="Votes do not follow the ore: most countries that sell China little vote with it anyway"
        verdict={vVotes}
        matters="UN votes are the most quoted evidence that the region is drifting toward China. If the votes are a habit shared by countries that sell China nothing, they cannot be read as a mineral dividend, and a country cannot be won back at the General Assembly by buying its ore."
        usual="Countries that depend on China for their exports vote with it; the others vote with the United States."
        test="Each country's latest year with both China components of the index: the export share to China and UN General Assembly voting alignment with China, both on the index's 0–100 component scale."
        record={votes && votes.rows.length ? [
          { text: `Alignment with China runs from ${votes.votesMin?.toFixed(0)}${votes.lowest ? ` (${name(votes.lowest.iso3)}, ${votes.lowest.year})` : ""} to ${votes.votesMax?.toFixed(0)} on the component scale across ${votes.rows.length} countries; the export share from ${Math.min(...votes.rows.map((r) => r.trade)).toFixed(0)} to ${Math.max(...votes.rows.map((r) => r.trade)).toFixed(0)}.`, kind: "model" as const },
          { text: `Correlation between the two across countries: ${votes.correlation != null ? votes.correlation.toFixed(2) : "—"}. Countries that sell little to China yet vote with it (share under 25, alignment 50 or more): ${votes.lowTradeHighVotes.length} (${votes.lowTradeHighVotes.map((r) => name(r.iso3)).join(", ") || "none"}).`, kind: "model" as const },
        ] : [{ text: "The components file is not in this release.", kind: "model" as const }]}
        soWhat="Voting with China at the General Assembly is a regional habit older than the mineral trade, shared by countries that sell it nothing, and a few capitals break it for reasons of their own. So a vote is weak evidence of a mineral tie, and a mineral tie buys no extra vote."
        overturn="A measure of alignment on the votes that matter to Beijing (Taiwan, Xinjiang, the South China Sea) rather than the whole General Assembly, showing the big sellers closer to China than the rest."
        links={[{ href: "/votes-and-ore", label: "Votes and ore, the quadrant" }, { href: "/explore?index=political_alignment", label: "Political alignment on the map" }]}
      />

      <Claim
        n={7}
        id="talk"
        headline="Washington talks about China; Beijing paid"
        verdict={vTalk}
        matters="Statements are cheap and commitments are not. A rivalry fought with words on one side and money on the other is not a symmetric contest, and the region's governments can see which side has so far paid for its presence."
        usual="The United States is re-engaging the region with money to counter China."
        test="Statements by US and Chinese officials in the dataset, coded for the position they take on China, against documented commitments from each side's institutions in the same window."
        record={talk ? [
          { text: talk.us && talk.us.onChina ? `US officials: ${talk.us.n} statements; ${talk.us.onChina.negative} of the ${talk.us.onChina.total} that take a position on China are negative.` : "", kind: "facts" as const },
          { text: talk.cn && talk.cn.onChina ? `Chinese officials: ${talk.cn.n} statements; ${talk.cn.onChina.positive} of ${talk.cn.onChina.total} with a position praise China's role.` : "", kind: "facts" as const },
          { text: `Commitments ${talk.finance.CN.years[0]}–${talk.finance.CN.years[1]}: China ${fmtMusd(talk.finance.CN.musd)}, the United States ${fmtMusd(talk.finance.US.musd)}; US commitments ${talk.finance.US_after.years[0]}–${talk.finance.US_after.years[1]}: ${fmtMusd(talk.finance.US_after.musd)}.`, kind: "facts" as const },
          { text: talk.ratios.statements_us_over_cn != null && talk.ratios.money_cn_over_us_2015_21 != null ? `${talk.ratios.statements_us_over_cn.toFixed(1)} US statements for every Chinese one; ${talk.ratios.money_cn_over_us_2015_21.toFixed(1)} Chinese dollars committed for every American one.` : "", kind: "facts" as const },
        ].filter((r) => r.text) : [{ text: "No statements in this release.", kind: "facts" as const }]}
        soWhat="The US presence in the record is rhetorical and the Chinese presence financial. Whether the DFC's later growth changes that depends on money that is still mostly announced, not disbursed; the statements dataset is the owner's own and not a census of what was said."
        overturn="US commitments after 2021 rising toward the Chinese totals of 2015–2021, or a statements census showing Chinese officials speaking as often."
        links={[{ href: "/lab#ledger", label: "Who talks, who pays" }, { href: "/story#c1-ledger", label: "The ledger balance" }]}
      />

      <Claim
        n={8}
        id="hedge"
        headline="Most of the region's leaders mention neither power"
        verdict={vHedge}
        matters="The two powers describe a region choosing sides. If its own leaders rarely mention either, the choice they are said to face is largely a framing imposed from outside, and the policy space for not choosing is wider than the rivalry's language admits."
        usual="Latin American governments are choosing sides."
        test="Statements by Latin American executives on critical minerals in the dataset: how many take any position on China, on the United States, on both, or on neither."
        record={talk?.latam ? [
          { text: `${talk.latam.n} executive statements; ${talk.latam.neitherCn} mention no position on China and ${talk.latam.neitherUs} none on the United States; ${neither != null ? fmtPct(neither, 0) : "—"} name neither.`, kind: "facts" as const },
          { text: `Hedging balance by country (1 = equally warm to both, 0 = one-sided): ${d.insights?.region.hedgers.slice().sort((a, b) => b.balance - a.balance).slice(0, 4).map((h) => `${name(h.iso3)} ${h.balance.toFixed(2)}`).join(", ") ?? "—"}.`, kind: "facts" as const },
        ] : [{ text: "No statements in this release.", kind: "facts" as const }]}
        soWhat="The region talks about its minerals as its own: royalties, lithium policy, value added, not about Beijing or Washington. The rivalry the two capitals describe is, in Latin American mouths, mostly absent."
        overturn="A census of statements (not the owner's selection) showing most executive statements naming one of the two powers."
        links={[{ href: "/story#c5-hedging", label: "Hedging: who praises both" }, { href: "/region#stm-h", label: "What leaders say, by bloc" }]}
      />

      <Claim
        n={9}
        id="attention"
        headline="Washington's attention arrived after Beijing's money had left"
        verdict={vAtt}
        matters="Policy that reacts to a narrative rather than to a balance sheet arrives late and aims at a past position. If Washington's attention peaked when Beijing's money had already fallen, the measures it produced were calibrated to a presence that no longer existed in that form."
        usual="US policy responded to Chinese lending as it grew."
        test={`US policy documents on the region's minerals per year (Congress.gov and the Federal Register) against Chinese commitments in the same year${att?.span ? `, ${att.span[0]}–${att.span[1]}` : ""}.`}
        record={att ? [
          { text: att.peakMoney ? `Chinese commitments peaked in ${att.peakMoney.year} (${fmtMusd(att.peakMoney.cn_musd!)}), when Washington produced ${att.peakMoney.policy_docs} documents.` : "", kind: "facts" as const },
          { text: att.peakDocs ? `Policy documents peaked in ${att.peakDocs.year} (${att.peakDocs.policy_docs}), when Chinese commitments were ${fmtMusd(att.peakDocs.cn_musd!)}.` : "", kind: "facts" as const },
          { text: `Correlation of documents with Chinese money across the ${att.years} years both are known: ${att.corr != null ? att.corr.toFixed(2) : "—"}.`, kind: "facts" as const },
        ].filter((r) => r.text) : [{ text: "No attention series in this release.", kind: "facts" as const }]}
        soWhat="The policy response is counter-cyclical to the thing it describes: the bills and rules came when the lending had already fallen to a fraction of its peak. Attention tracks the narrative of Chinese presence, not its balance sheet."
        overturn="Policy counts that follow the money with a lag of a year or two once the Chinese series extends past 2021, or a different measure of attention (hearings, appropriations) that peaks with the lending."
        links={[{ href: "/lab#attention", label: "Attention and money" }, { href: "/story#c1-attention", label: "Attention and the cheque book" }]}
      />

      <Claim
        n={10}
        id="pressure"
        headline="Pressure removes options and builds nothing"
        verdict={vCases}
        matters="Denial is the main US instrument in the mineral rivalry. If it removes a Chinese option without putting another in its place, the cost falls on the host country, which loses a project and gains nothing, and the policy's own aim of supply is not served."
        usual="US pressure on Chinese projects clears the way for US and allied alternatives."
        test="The companion study's documented cases of US pressure on a Chinese-linked mineral option since 2017, each coded for the outcome, whether US pressure is the documented cause, and whether an alternative was built."
        record={cases ? [
          { text: `${cases.n} cases: the Chinese-linked option was cancelled, frozen, transferred, modified or restricted in ${cases.removed}; ${cases.unchanged} show no observable change.`, kind: "facts" as const },
          { text: `A source names US pressure as the cause in ${cases.documented}; a US or allied alternative was built in part in ${cases.altPartial} and in full in ${cases.altFull}.`, kind: "facts" as const },
        ] : [{ text: "The companion records are not in this release.", kind: "facts" as const }]}
        soWhat="Denial works as denial. What it does not do is substitute: no case ends with a like-for-like project paid for with US public money. For the host country the result is one option fewer, not a new one."
        overturn="A documented case in which the alternative was built, financed and is operating; or sources naming US pressure as the cause in most of the removals."
        links={[{ href: "/denial", label: "Denial without Substitution" }, { href: "/stage#s-ladder", label: "The commitment ladder" }]}
      />

      <Claim
        n={11}
        id="route"
        headline="The United States gets more of the region's ore than its customs show, but not as much more as it fears"
        verdict="open"
        matters="Hidden dependence is the argument for treating the whole hemisphere as a US supply chain. The record puts a ceiling on it: the dependence can be at most so large, which is enough to matter and too small for the strongest claims."
        usual="American supply chains run on Latin American minerals routed through allies, so the dependence is hidden."
        test={`The United States' reconciled imports of the tracked minerals by origin (CEPII BACI), and for each intermediary the smaller of its two legs (what it bought from the region, what it sold to the United States) as a ceiling on the indirect route${route ? `, ${route.year}` : ""}.`}
        record={route ? [
          { text: `${route.direct != null ? fmtPct(route.direct, 0) : "—"} of US imports (${route.world ? fmtMusd(route.world) : "—"}) came straight from the ${COUNTRY_COUNT_WORD} countries.`, kind: "facts" as const },
          { text: `At most ${route.bound != null ? fmtPct(route.bound, 0) : "—"} more could have passed through an intermediary${route.top ? `; the largest ceiling is ${economyName(route.top.iso3)} at ${fmtMusd(route.top.bound ?? 0)}` : ""}. The record cannot follow a shipment, so this is a bound, never an estimate.`, kind: "facts" as const },
        ] : [{ text: "The routes file is not in this release.", kind: "facts" as const }]}
        soWhat="The hidden dependence is real but bounded: even if every tonne an intermediary bought from the region went on to the United States, the region's share of US imports would rise by the ceiling and no further. Claims of a hidden dependence larger than that are not supported by the trade record."
        overturn="Shipment-level or firm-level data tracing the intermediaries' re-exports, which would turn the ceiling into a figure."
        links={[{ href: "/routes", label: "Where the United States gets it" }, { href: "/story#c0-routes", label: "The indirect route, in the story" }]}
      />

      <p className="mt-8 text-xs text-ink-3">Verdict rules: &ldquo;holds&rdquo; when the computed numbers meet the rule stated in the test and its code (web/src/components/contested/ContestedView.tsx), &ldquo;in part&rdquo; when they meet it in one direction only, &ldquo;fails&rdquo; when they contradict it, &ldquo;cannot be settled&rdquo; when the record lacks the rows or the claim is a bound. The claims and the &ldquo;so what&rdquo; lines are interpretation, AI-drafted for the team and unreviewed until the owner signs them.</p>
    </div>
  );
}
