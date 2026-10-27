"use client";

import Link from "next/link";
import { PageGuide } from "@/components/ui/Reading";
import { HeaderPicture } from "@/components/ui/Picture";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT_WORD, countWord } from "@/lib/constants";
import { claimHref, MAIN_CLAIMS, MORE_CLAIMS } from "@/lib/contested";
import { fmtMusd, fmtPct, fmtShare, fmtSigned } from "@/lib/format";
import { economyName } from "@/lib/routes";
import { Claim, name, pp, VerdictRules } from "./Claim";
import { useContested } from "./useContested";

/**
 * The further claims: tested the same way as the main ones, on the same record and by the same rules, and kept on their
 * own page because they are weaker, more technical, robustness checks on the main claims or open on this record. The
 * numbering carries on from the main page.
 */
export function ContestedMoreView() {
  const { loading, error, data, verdicts } = useContested();
  if (loading) return <InsightsSkeleton />;
  if (error || !data || !verdicts) return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-ink-2">The data files could not be loaded.</div>;
  const { sample, pictures, panel, votes, talk, neither, hedgers, cases, conc, echoes, flips, bigFlips, noisy, warm, hk, fans, route } = data;
  const biggestTerm = panel?.rows.length ? panel.rows.reduce((p, r) => (Math.abs(r.coef ?? 0) > Math.abs(p.coef ?? 0) ? r : p), panel.rows[0]) : null;
  const cnFamilies = echoes?.rows.filter((r) => r.event_actor === "CN").length ?? 0;
  const noisyNearZero = noisy.length ? noisy.reduce((a, f) => a + f.nearZero, 0) / noisy.length : null;
  const mainWord = countWord(MAIN_CLAIMS.length);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-6 sm:px-6">
      <p className="eyebrow">Against the grain · further claims</p>
      <h1 className="serif mt-1 text-3xl font-bold leading-tight sm:text-4xl">{countWord(MORE_CLAIMS.length, true)} further claims</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">The <Link href="/contested" className="underline decoration-dotted">arguments page</Link> tests the {mainWord} strongest claims against the usual story of the rivalry. These {countWord(MORE_CLAIMS.length)} are tested the same way, on the same record and by the same rules: the test is stated, the numbers are computed from the data files when the page loads, and the verdict follows a rule written next to it. They sit here because they are weaker, more technical, robustness checks on the main claims, or open on this record; some state the usual reading and are tested because the record is expected to fail them. The wording of the claims is the team&apos;s, AI-drafted and labelled interpretation; the numbers are facts or model outputs and carry their labels.</p>
      <PageGuide purpose="The further claims: the weaker, technical and open arguments, each with its test, findings, record and verdict." read="Read the headline, then the findings and the record; the verdict is a rule applied to the numbers, and the last line says what evidence would overturn it. The numbering continues from the main page." next={[{ href: "/contested", label: `The ${mainWord} main claims` }, { href: "/methodology", label: "How the record is built" }]} />
      <HeaderPicture id="washington" className="mt-3" />
      {sample && <p className="mt-2 rounded-md border border-sample/40 bg-sample/10 px-3 py-2 text-sm text-sample">Sample data: the verdicts below are computed on the sample set and mean nothing until the first data run.</p>}

      <Claim
        pictures={pictures}
        id="panel"
        verdict={verdicts.panel}
        matters="Both capitals justify their finance, diplomacy and governance programmes partly as ways to shape where the region's minerals go. If none of these levers is detectable in the ore, the programmes need another justification, or a longer horizon than the record covers."
        usual="Finance, diplomacy and governance shape where a country's minerals go."
        test={`A panel regression of China's share of each country's exports on last year's Chinese finance, UN-vote alignment, electoral democracy, rule of law and mineral rents, with country and year fixed effects${panel?.n_obs ? ` (${panel.n_obs} country-years, ${panel.n_countries} countries, ${panel.years})` : ""}; wild-cluster p-values.`}
        findingsKind="model"
        findings={panel && panel.rows.length ? [
          panel.n_obs != null && panel.n_countries != null ? `${panel.rows.length} terms tested on ${panel.n_obs} country-years across ${panel.n_countries} countries${panel.years ? `, ${panel.years}` : ""}.` : `${panel.rows.length} terms tested.`,
          panel.significant.length ? `${panel.significant.length} of the ${panel.rows.length} coefficients clear the wild-cluster threshold: ${panel.significant.map((r) => r.term.replace(/_/g, " ")).join(", ")}.` : `None of the ${panel.rows.length} coefficients clears the wild-cluster threshold.`,
          biggestTerm ? `The largest coefficient is ${biggestTerm.term.replace(/_/g, " ")}: ${fmtSigned((biggestTerm.coef ?? 0) * 100, 1)} share points per standard deviation, p = ${biggestTerm.p_wild?.toFixed(2) ?? "—"}.` : null,
        ] : ["No panel in this release."]}
        record={panel && panel.rows.length ? panel.rows.map((r) => ({ text: `${r.term.replace(/_/g, " ")}: ${fmtSigned((r.coef ?? 0) * 100, 1)} share points per standard deviation, p = ${r.p_wild?.toFixed(2) ?? "—"}.`, kind: "model" as const })) : [{ text: "No panel in this release.", kind: "model" as const }]}
        soWhat={verdicts.panel === "holds" ? "None of the levers the two capitals pull is detectable in the ore at this sample size. That is not proof they do nothing; it is proof that whatever they do is small next to geology and prices, which the fixed effects absorb." : "At least one lever is detectable in the ore; the rows above say which, and the Lab's panel block shows its size."}
        overturn="A longer panel, or mineral-level outcomes, finding a coefficient that survives dropping any one country. The jackknife ranges in the Lab say how far each coefficient moves when one country leaves."
        links={[{ href: "/lab#panel", label: "The panel block, with the jackknife" }, { href: "/methodology#events", label: "Event studies and panels" }]}
      />

      <Claim
        pictures={pictures}
        id="votes"
        verdict={verdicts.votes}
        matters="UN votes are the most quoted evidence that the region is drifting toward China. If the votes are a habit shared by countries that sell China nothing, they cannot be read as a mineral dividend, and a country cannot be won back at the General Assembly by buying its ore."
        usual="Countries that depend on China for their exports vote with it; the others vote with the United States."
        test="The claim as tested: most countries that sell China little vote with it anyway. Each country's latest year with both China components of the index: the export share to China and UN General Assembly voting alignment with China, both on the index's 0–100 component scale."
        findingsKind="model"
        findings={votes && votes.rows.length ? [
          `Alignment with China spans ${votes.votesMin?.toFixed(0)} to ${votes.votesMax?.toFixed(0)} on the component scale across ${votes.rows.length} countries.`,
          `${votes.lowTradeHighVotes.length} of the ${votes.rows.length} sit in the corner the test names, selling China little and voting with it.`,
          votes.correlation != null ? `Across countries, export share and alignment correlate at ${votes.correlation.toFixed(2)}.` : null,
        ] : ["The components file is not in this release."]}
        record={votes && votes.rows.length ? [
          { text: `Alignment with China runs from ${votes.votesMin?.toFixed(0)}${votes.lowest ? ` (${name(votes.lowest.iso3)}, ${votes.lowest.year})` : ""} to ${votes.votesMax?.toFixed(0)} on the component scale across ${votes.rows.length} countries; the export share from ${Math.min(...votes.rows.map((r) => r.trade)).toFixed(0)} to ${Math.max(...votes.rows.map((r) => r.trade)).toFixed(0)}.`, kind: "model" as const },
          { text: `Correlation between the two across countries: ${votes.correlation != null ? votes.correlation.toFixed(2) : "—"}. Countries that sell little to China yet vote with it (share under 25, alignment 50 or more): ${votes.lowTradeHighVotes.length} (${votes.lowTradeHighVotes.map((r) => name(r.iso3)).join(", ") || "none"}).`, kind: "model" as const },
        ] : [{ text: "The components file is not in this release.", kind: "model" as const }]}
        soWhat="Voting with China at the General Assembly is a regional habit older than the mineral trade, shared by countries that sell it nothing, and a few capitals break it for reasons of their own. So a vote is weak evidence of a mineral tie, and a mineral tie buys no extra vote."
        overturn="A measure of alignment on the votes that matter to Beijing (Taiwan, Xinjiang, the South China Sea) rather than the whole General Assembly, showing the big sellers closer to China than the rest."
        links={[{ href: "/votes-and-ore", label: "Votes and ore, the quadrant" }, { href: "/explore?index=political_alignment", label: "Political alignment on the map" }]}
      />

      <Claim
        pictures={pictures}
        id="talk"
        verdict={verdicts.talk}
        matters="Statements are cheap and commitments are not. A rivalry fought with words on one side and money on the other is not a symmetric contest, and the region's governments can see which side has so far paid for its presence."
        usual="The United States is re-engaging the region with money to counter China."
        test="Statements by US and Chinese officials in the dataset, coded for the position they take on China, against documented commitments from each side's institutions in the same window."
        findings={talk ? [
          talk.us && talk.cn && talk.ratios.statements_us_over_cn != null ? `${talk.ratios.statements_us_over_cn.toFixed(1)} US statements for every Chinese one in the dataset: ${talk.us.n} against ${talk.cn.n}.` : null,
          `Commitments ${talk.finance.CN.years[0]}–${talk.finance.CN.years[1]}: China ${fmtMusd(talk.finance.CN.musd)}, the United States ${fmtMusd(talk.finance.US.musd)}${talk.ratios.money_cn_over_us_2015_21 != null ? `, ${talk.ratios.money_cn_over_us_2015_21.toFixed(1)} Chinese dollars per American one` : ""}.`,
          `US commitments ${talk.finance.US_after.years[0]}–${talk.finance.US_after.years[1]}: ${fmtMusd(talk.finance.US_after.musd)}.`,
        ] : ["No statements in this release."]}
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
        pictures={pictures}
        id="hedge"
        verdict={verdicts.hedge}
        matters="The two powers describe a region choosing sides. If its own leaders rarely mention either, the choice they are said to face is largely a framing imposed from outside, and the policy space for not choosing is wider than the rivalry's language admits."
        usual="Latin American governments are choosing sides."
        test="Statements by Latin American executives on critical minerals in the dataset: how many take any position on China, on the United States, on both, or on neither."
        findings={talk?.latam ? [
          neither != null ? `${talk.latam.n} Latin American executive statements; ${fmtPct(neither, 0)} take no position on either power.` : `${talk.latam.n} Latin American executive statements.`,
          `${talk.latam.neitherCn} take no position on China and ${talk.latam.neitherUs} none on the United States.`,
          hedgers.length ? `The most balanced hedger is ${name(hedgers[0].iso3)}, at ${hedgers[0].balance.toFixed(2)} on a scale where one is equally warm to both.` : null,
        ] : ["No statements in this release."]}
        record={talk?.latam ? [
          { text: `${talk.latam.n} executive statements; ${talk.latam.neitherCn} mention no position on China and ${talk.latam.neitherUs} none on the United States; ${neither != null ? fmtPct(neither, 0) : "—"} name neither.`, kind: "facts" as const },
          { text: `Hedging balance by country (1 = equally warm to both, 0 = one-sided): ${hedgers.slice(0, 4).map((h) => `${name(h.iso3)} ${h.balance.toFixed(2)}`).join(", ") || "—"}.`, kind: "facts" as const },
        ] : [{ text: "No statements in this release.", kind: "facts" as const }]}
        soWhat="The region talks about its minerals as its own: royalties, lithium policy, value added, not about Beijing or Washington. The rivalry the two capitals describe is, in Latin American mouths, mostly absent."
        overturn="A census of statements (not the owner's selection) showing most executive statements naming one of the two powers."
        links={[{ href: "/story#c5-hedging", label: "Hedging: who praises both" }, { href: "/region#stm-h", label: "What leaders say, by bloc" }]}
      />

      <Claim
        pictures={pictures}
        id="pressure"
        verdict={verdicts.pressure}
        matters="Denial is the main US instrument in the mineral rivalry. If it removes a Chinese option without putting another in its place, the cost falls on the host country, which loses a project and gains nothing, and the policy's own aim of supply is not served."
        usual="US pressure on Chinese projects clears the way for US and allied alternatives."
        test="The companion study's documented cases of US pressure on a Chinese-linked mineral option since 2017, each coded for the outcome, whether US pressure is the documented cause, and whether an alternative was built."
        findings={cases ? [
          `In ${cases.removed} of ${cases.n} cases the Chinese-linked option was cancelled, frozen, transferred, modified or restricted.`,
          `A source names US pressure as the cause in ${cases.documented}; ${cases.unchanged} cases show no observable change.`,
          `A US or allied alternative was built in part in ${cases.altPartial} cases and in full in ${cases.altFull}.`,
        ] : ["The companion records are not in this release."]}
        record={cases ? [
          { text: `${cases.n} cases: the Chinese-linked option was cancelled, frozen, transferred, modified or restricted in ${cases.removed}; ${cases.unchanged} show no observable change.`, kind: "facts" as const },
          { text: `A source names US pressure as the cause in ${cases.documented}; a US or allied alternative was built in part in ${cases.altPartial} and in full in ${cases.altFull}.`, kind: "facts" as const },
        ] : [{ text: "The companion records are not in this release.", kind: "facts" as const }]}
        soWhat="Denial works as denial. What it does not do is substitute: no case ends with a like-for-like project paid for with US public money. For the host country the result is one option fewer, not a new one."
        overturn="A documented case in which the alternative was built, financed and is operating; or sources naming US pressure as the cause in most of the removals."
        links={[{ href: "/denial", label: "Denial without Substitution" }, { href: "/stage#s-ladder", label: "The commitment ladder" }]}
      />

      <Claim
        pictures={pictures}
        id="route"
        verdict={verdicts.route}
        matters="Hidden dependence is the argument for treating the whole hemisphere as a US supply chain. The record puts a ceiling on it: the dependence can be at most so large, which is enough to matter and too small for the strongest claims."
        usual="American supply chains run on Latin American minerals routed through allies, so the dependence is hidden."
        test={`The claim as tested: the United States gets more of the region's ore than its customs show, but not as much more as it fears. The United States' reconciled imports of the tracked minerals by origin (CEPII BACI), and for each intermediary the smaller of its two legs (what it bought from the region, what it sold to the United States) as a ceiling on the indirect route${route ? `, ${route.year}` : ""}.`}
        findings={route ? [
          route.direct != null && route.world != null ? `${fmtPct(route.direct, 0)} of US imports of the tracked minerals, ${fmtMusd(route.world)} in ${route.year}, came straight from the ${COUNTRY_COUNT_WORD} countries.` : `The routes file has no world total for ${route.year}, so the direct share cannot be read.`,
          route.bound != null ? `At most ${fmtPct(route.bound, 0)} more could have passed through an intermediary.` : null,
          route.top && route.top.bound != null ? `The largest single ceiling is ${economyName(route.top.iso3)}, at ${fmtMusd(route.top.bound)}.` : null,
        ] : ["The routes file is not in this release."]}
        record={route ? [
          { text: `${route.direct != null ? fmtPct(route.direct, 0) : "—"} of US imports (${route.world ? fmtMusd(route.world) : "—"}) came straight from the ${COUNTRY_COUNT_WORD} countries.`, kind: "facts" as const },
          { text: `At most ${route.bound != null ? fmtPct(route.bound, 0) : "—"} more could have passed through an intermediary${route.top ? `; the largest ceiling is ${economyName(route.top.iso3)} at ${fmtMusd(route.top.bound ?? 0)}` : ""}. The record cannot follow a shipment, so this is a bound, never an estimate.`, kind: "facts" as const },
        ] : [{ text: "The routes file is not in this release.", kind: "facts" as const }]}
        soWhat="The hidden dependence is real but bounded: even if every tonne an intermediary bought from the region went on to the United States, the region's share of US imports would rise by the ceiling and no further. Claims of a hidden dependence larger than that are not supported by the trade record."
        overturn="Shipment-level or firm-level data tracing the intermediaries' re-exports, which would turn the ceiling into a figure."
        links={[{ href: "/routes", label: "Where the United States gets it" }, { href: "/story/appendix#c0-routes", label: "The indirect route, in the story" }]}
      />

      <Claim
        pictures={pictures}
        id="echoes"
        verdict={verdicts.echoes}
        matters="Tariffs, strategies and laws are the instruments the United States reaches for in the mineral rivalry. If the years after them show the US share falling and China's rising, the instruments are at best not working through trade, and at worst are being read as success while the line they are meant to move goes the other way."
        usual="US measures on critical minerals pull the region's trade toward the United States and away from China."
        test="The event echoes: for each family of events with two or more windows, the mean change of each actor's export share in the years after the events, minus the years before. Coincidence counts, not effects; every event is still in draft."
        findingsKind="model"
        findings={echoes && echoes.rows.length ? [
          echoes.usMeasures.length ? `After ${echoes.usLose} of the ${echoes.usMeasures.length} families of US measures the US share fell on average.` : "No family of US measures has two or more windows.",
          `${echoes.rows[0].label} (${echoes.rows[0].n} windows): US share ${echoes.rows[0].US != null ? pp(echoes.rows[0].US) : "no rows"}, China's share ${echoes.rows[0].CN != null ? pp(echoes.rows[0].CN) : "no rows"}.`,
          `${echoes.rows.length} families have two or more windows: ${echoes.usMeasures.length} of US measures, ${cnFamilies} of Chinese ones.`,
        ] : ["No event echoes in this release."]}
        record={echoes && echoes.rows.length ? echoes.rows.map((r) => ({ text: `${r.label} (${r.n} windows): US share ${r.US != null ? pp(r.US) : "—"}, China's share ${r.CN != null ? pp(r.CN) : "—"}.`, kind: "model" as const })) : [{ text: "No event echoes in this release.", kind: "model" as const }]}
        soWhat={echoes && echoes.usLose === echoes.usMeasures.length && echoes.usMeasures.length > 0 ? "After every family of US measures the US share fell on average. The measures came in the years China's purchases were already climbing, so they mark the trend they were meant to reverse rather than reversing it. Chinese export controls, by contrast, moved almost nothing." : "The families split: the rows say after which measures the US share rose and after which it fell."}
        overturn="Windows after US measures in which the US share rose net of the trend, once the events are verified and the windows control for prices."
        links={[{ href: "/lab#shocks", label: "After the shock" }, { href: "/methodology#events", label: "Event studies" }]}
      />

      <Claim
        pictures={pictures}
        id="flips"
        verdict={verdicts.flips}
        matters="Headlines about a country turning toward China or back are built on indices like this one. If the big exporters never changed sign while the small economies flip every few years around zero, a reported turn is only meaningful where it never happens, and the noise is where the turns are reported."
        usual="Countries swing between the two powers as governments and deals change."
        test={`Net lean (China minus US, composite index, all minerals) by country and year: the number of times its sign changed over the record, and where it stands${conc ? `; the three largest exporters to China in ${conc.year} are the test of "where it matters"` : ""}.`}
        findingsKind="model"
        findings={flips && flips.length ? [
          bigFlips.length ? `Sign changes among the largest exporters to China: ${bigFlips.map((f) => `${name(f.iso3)} ${f.flips}`).join(", ")}.` : "The three largest exporters to China have no index rows.",
          bigFlips.length ? `Their latest leans: ${bigFlips.map((f) => `${name(f.iso3)} ${fmtSigned(f.last, 0)} in ${f.lastYear}`).join(", ")}.` : null,
          noisy.length && noisyNearZero != null ? `${noisy.length} of ${flips.length} countries flipped sign repeatedly; there the lean sat near zero in ${fmtPct(noisyNearZero, 0)} of their years.` : `None of the ${flips.length} countries flipped sign repeatedly.`,
        ] : ["The index file is not in this release."]}
        record={flips && flips.length ? [
          { text: bigFlips.length ? `${bigFlips.map((f) => `${name(f.iso3)} ${f.flips} ${f.flips === 1 ? "flip" : "flips"} in ${f.years} years, lean ${fmtSigned(f.last, 0)} in ${f.lastYear}`).join("; ")}.` : "The three largest exporters have no index rows.", kind: "model" as const },
          { text: `${noisy.length} countries flipped five times or more: ${noisy.map((f) => `${name(f.iso3)} ${f.flips}`).join(", ") || "none"}; in those the lean sat within ten points of zero in ${noisyNearZero != null ? fmtPct(noisyNearZero, 0) : "—"} of their years.`, kind: "model" as const },
        ] : [{ text: "The index file is not in this release.", kind: "model" as const }]}
        soWhat="The index says something firm about the countries that carry the trade and almost nothing about the countries that do not: there the sign is a coin toss around zero with few components. Read a flip in a small economy as noise unless a component moved."
        overturn="A big exporter changing sign and staying there for several years, or the small economies' flips lining up with recorded events rather than with missing components."
        links={[{ href: "/region", label: "The ranking, year by year" }, { href: "/explore", label: "The index on the map" }]}
      />

      <Claim
        pictures={pictures}
        id="warm"
        verdict={verdicts.warm}
        matters="The friendliest rhetoric toward the United States comes from governments that sell it almost none of their minerals, and the biggest seller to the United States is coded lukewarm. If warmth and trade run opposite, courting the warm capitals buys goodwill, not supply, and supply sits where the words are cool."
        usual="Governments that speak well of the United States are its partners in minerals."
        test={`Each country's executive statements coded for their stance toward the United States (0 to 1, pooled over the latest statement years) against the US share of its reported mineral exports in the latest trade year; "warm" is a stance of 0.5 or more, "no trade" a share under 10%.`}
        findings={warm && warm.rows.length ? [
          `${warm.warmNoTrade.length} of ${warm.rows.length} coded countries are warm toward the United States and send it almost no minerals${warm.warmNoTrade.length ? `: ${warm.warmNoTrade.map((r) => name(r.iso3)).join(", ")}` : ""}.`,
          warm.warmNoTrade[0] ? `The warmest, ${name(warm.warmNoTrade[0].iso3)}: stance ${warm.warmNoTrade[0].stance.toFixed(2)} over ${warm.warmNoTrade[0].n} statements, ${fmtShare(warm.warmNoTrade[0].share)} of exports to the United States in ${warm.warmNoTrade[0].year}.` : null,
          `${warm.coolTrade.length} ${warm.coolTrade.length === 1 ? "is" : "are"} cool and trading${warm.coolTrade.length ? `: ${warm.coolTrade.map((r) => `${name(r.iso3)} ${fmtShare(r.share)}`).join(", ")}` : ""}.`,
        ] : ["No coded statements in this release."]}
        record={warm && warm.rows.length ? [
          { text: `Warm and no trade: ${warm.warmNoTrade.map((r) => `${name(r.iso3)} (stance ${r.stance.toFixed(2)} over ${r.n} statements, ${fmtShare(r.share)} of exports to the United States in ${r.year})`).join("; ") || "none"}.`, kind: "facts" as const },
          { text: `Cool and trading: ${warm.coolTrade.map((r) => `${name(r.iso3)} (stance ${r.stance.toFixed(2)}, ${fmtShare(r.share)})`).join("; ") || "none"}.`, kind: "facts" as const },
        ] : [{ text: "No coded statements in this release.", kind: "facts" as const }]}
        soWhat="The words follow politics and the trade follows geography. Mexico sells to its neighbour whatever its presidents say; Argentina and Peru praise a buyer that barely buys. The dataset's coding is the team's own and unvalidated, so the pattern is a prompt to look, not a measurement."
        overturn="A validated coding showing the warm capitals' statements concern other sectors, or US purchases rising where the words are warm."
        links={[{ href: "/story#c5-words-trade", label: "Words against trade, country by country" }, { href: "/lab#words", label: "Words and money" }]}
      />

      <Claim
        pictures={pictures}
        id="hongkong"
        verdict={verdicts.hongkong}
        matters={<>The commonest objection to <Link href={claimHref("capital")} className="underline decoration-dotted">the capital claim on the main page</Link> is that Chinese ownership runs through Hong Kong and the Caribbean, so the reported mainland positions understate it. If the Hong Kong positions are small too, the gap between American and Chinese capital stands; if they are large, the capital claim needs a footnote. This is a claim the record is expected to fail.</>}
        usual="The reported Chinese positions are small only because the money comes in through Hong Kong."
        test="Each country's latest reported inward position from mainland China and from Hong Kong SAR (IMF DIP), country by country; the claim holds only if the Hong Kong position is the larger of the two, and at least US$1 bn, in most reporting countries and in total."
        findings={hk && hk.rows.length ? [
          `Hong Kong's position is the larger of the two, above the test's floor, in ${hk.hkLarger.length} of ${hk.rows.length} reporting countries.`,
          `Summed over the reporting countries: Hong Kong ${fmtMusd(hk.hkTotal)}, mainland China ${fmtMusd(hk.cnTotal)}.`,
          hk.hkLarger[0] ? `The largest Hong Kong channel is ${name(hk.hkLarger[0].iso3)}: ${fmtMusd(hk.hkLarger[0].HKG!.musd)} in ${hk.hkLarger[0].HKG!.year}${hk.hkLarger[0].CHN ? ` against ${hk.hkLarger[0].CHN.musd < 0 ? "a negative mainland position" : `mainland ${fmtMusd(hk.hkLarger[0].CHN.musd)}`}` : ""}.` : "No reporting country has a Hong Kong position above the floor that is larger than the mainland's.",
        ] : ["The investment file is not in this release."]}
        record={hk && hk.rows.length ? [
          { text: `Hong Kong larger and at least US$1 bn in ${hk.hkLarger.length} of ${hk.rows.length} reporting countries: ${hk.hkLarger.map((r) => `${name(r.iso3)} (Hong Kong ${fmtMusd(r.HKG!.musd)} vs ${r.CHN ? (r.CHN.musd < 0 ? "a negative mainland position" : `mainland ${fmtMusd(r.CHN.musd)}`) : "no mainland row"}, ${r.HKG!.year})`).join("; ") || "none"}.`, kind: "facts" as const },
          { text: `Totals over the reporting countries, negative positions counted as nothing: Hong Kong ${fmtMusd(hk.hkTotal)}, mainland China ${fmtMusd(hk.cnTotal)}.`, kind: "facts" as const },
        ] : [{ text: "The investment file is not in this release.", kind: "facts" as const }]}
        soWhat={verdicts.hongkong === "fails" ? <>The Hong Kong channel exists where Brazil&apos;s negative mainland position meets a positive Hong Kong one, and barely anywhere else. Even added together, the two Chinese positions are a rounding error beside the American ones, so the hidden channel does not rescue the picture of a China that owns the region&apos;s assets.</> : <>The Hong Kong positions are large enough to carry the Chinese stake; <Link href={claimHref("capital")} className="underline decoration-dotted">the capital claim on the main page</Link> needs them added.</>}
        overturn="Positions routed through the Caribbean centres or the Netherlands, attributed to ultimate owners, showing a Chinese stock comparable to the American one."
        links={[{ href: claimHref("capital"), label: "The capital claim" }, { href: "/story#c0-investment", label: "Who owns the capital" }]}
      />

      <Claim
        pictures={pictures}
        id="fans"
        verdict={verdicts.fans}
        matters="Forecasts to 2030 are the part of the site most likely to be quoted as a prediction. If the published fan for a country's share to China is wider than the whole range that share has covered since 2000, the forecast says that anything the past has shown can happen again, which is honest and not a prediction. Quoting the median as the future would be the error."
        usual="The models say where each country's exports will go by 2030."
        test="For each country with a published forecast, the 90% band of the share to China at 2030 (p95 minus p05) against the range the share has covered in the record (maximum minus minimum since 2000); the claim holds only if most fans are narrower than the history."
        findingsKind="model"
        findings={fans && fans.rows.length ? [
          `${fans.wider.length} of ${fans.rows.length} published fans at the horizon are at least as wide as the share's whole recorded range.`,
          fans.medianWidth != null ? `Median band width at the horizon: ${fmtPct(fans.medianWidth, 0)} of exports.` : null,
          `Widest: ${name(fans.rows[0].iso3)}, ${fmtPct(fans.rows[0].p05, 0)} to ${fmtPct(fans.rows[0].p95, 0)} against a history of ${fmtPct(fans.rows[0].min, 0)} to ${fmtPct(fans.rows[0].max, 0)}.`,
        ] : ["No published forecasts in this release."]}
        record={fans && fans.rows.length ? [
          { text: `${fans.wider.length} of ${fans.rows.length} fans are at least as wide as the country's whole history; median band width ${fans.medianWidth != null ? fmtPct(fans.medianWidth, 0) : "—"} of exports.`, kind: "model" as const },
          { text: `Widest: ${fans.rows.slice(0, 3).map((r) => `${name(r.iso3)} ${fmtPct(r.p05, 0)} to ${fmtPct(r.p95, 0)} against a history of ${fmtPct(r.min, 0)} to ${fmtPct(r.max, 0)}`).join("; ")}.`, kind: "model" as const },
        ] : [{ text: "No published forecasts in this release.", kind: "model" as const }]}
        soWhat={verdicts.fans === "fails" ? "The models are doing their job, which is to say how little is known: a band as wide as the history is a statement of uncertainty, not a forecast of direction. The honest reading of the Lab is the band, never the dashed line through it." : "Most fans are narrower than the history, so the models are saying something about direction; the Lab's backtests say how much to trust it."}
        overturn="Models with covariates (prices, mine pipelines) whose backtested bands are both calibrated and narrower than the history."
        links={[{ href: "/lab#board", label: "Where will the minerals go in 2030" }, { href: "/story#c7-fan", label: "The 2030 fan" }]}
      />

      <VerdictRules />
    </div>
  );
}
