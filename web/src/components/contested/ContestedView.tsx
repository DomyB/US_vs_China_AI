"use client";

import Link from "next/link";
import { LayerLabel } from "@/components/ui/Badges";
import { PageGuide } from "@/components/ui/Reading";
import { HeaderPicture } from "@/components/ui/Picture";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT_WORD, countWord } from "@/lib/constants";
import { claimHref, claimNumber, MAIN_CLAIMS, MORE_CLAIMS, type Turn } from "@/lib/contested";
import { fmtMusd, fmtPct, fmtShare } from "@/lib/format";
import { Bars, Claim, name, ORI, pp, VerdictRules } from "./Claim";
import { useContested } from "./useContested";

/** "Chile, Brazil and Peru": a list of names for a sentence. */
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const px = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 0 });

/**
 * The arguments page: the strongest claims against the usual story of the rivalry, each tested on the record, with the
 * further claims listed at the foot and told on their own page. The numbers come from the shared hook; the wording of
 * the claims, the findings and the verdicts is AI-drafted interpretation and says so.
 */
export function ContestedView() {
  const { loading, error, data, verdicts } = useContested();
  if (loading) return <InsightsSkeleton />;
  if (error || !data || !verdicts) return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-ink-2">The data files could not be loaded.</div>;
  const { sample, pictures, turns, ts, lend, peakShare, lastShare, cap, minerals, lithium, att, conc, prices } = data;
  const capRatio = cap?.USA && cap.CHN && cap.CHN.musd > 0 ? cap.USA.musd / cap.CHN.musd : null;
  const attGap = att?.peakDocs && att.peakMoney ? att.peakDocs.year - att.peakMoney.year : null;
  const moreWord = countWord(MORE_CLAIMS.length, true);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-6 sm:px-6">
      <p className="eyebrow">Against the grain</p>
      <h1 className="serif mt-1 text-3xl font-bold leading-tight sm:text-4xl">{countWord(MAIN_CLAIMS.length, true)} claims against the usual story, each tested on the record</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">The rest of the site describes and forecasts. This page argues. Each claim below cuts against a common account of the rivalry, or states one that the record contradicts, and each is tested on this site&apos;s own record: the test is stated, the numbers are computed from the data files when the page loads, and the verdict follows a rule written next to it, so a new data release can change it. These are the {countWord(MAIN_CLAIMS.length)} strongest; {countWord(MORE_CLAIMS.length)} further claims, weaker, more technical or still open, are tested the same way on <Link href="/contested/more" className="underline decoration-dotted">their own page</Link>. The wording of the claims is the team&apos;s, AI-drafted and labelled interpretation; the numbers are facts or model outputs and carry their labels.</p>
      <PageGuide purpose="The arguments: what the record says against the usual story of the rivalry, with the test and the verdict for each claim." read="Read the headline, then the findings and the record; the verdict is a rule applied to the numbers, and the last line says what evidence would overturn it. Every claim links to the exhibit that holds the detail." next={[{ href: "/contested/more", label: `${moreWord} further claims` }, { href: "/story", label: "The story, chapter by chapter" }, { href: "/lab", label: "Test your own scenario" }]} />
      <HeaderPicture id="beijing" className="mt-3" />
      {sample && <p className="mt-2 rounded-md border border-sample/40 bg-sample/10 px-3 py-2 text-sm text-sample">Sample data: the verdicts below are computed on the sample set and mean nothing until the first data run.</p>}

      <Claim
        pictures={pictures}
        id="turns"
        verdict={verdicts.turns}
        matters="If elections do not move the ore, then the policy bet that a friendlier government in Buenos Aires or Brasília will bring minerals to the United States is a bet on something the record has never shown. For the region it means the buyer is a structural fact, not a political choice to be rewarded or punished."
        usual="A government that turns right sends its minerals toward the United States; one that turns left sends them toward China."
        test={`The claim as tested: China's share rose after right turns as much as after left turns. Every change of government that changed the coded orientation in the six focus countries (the prototype's terms): China's share of the country's reported exports in the three years after the inauguration minus the three before, and the same change net of the region's own move. ${ts.tested} turns can be measured, ${ts.untested} cannot (not enough reported years on one side).`}
        findings={turns.length ? [
          ts.right.n > 0 && ts.right.mean != null ? `China's share rose after ${ts.right.up} of ${ts.right.n} right turns; mean change ${pp(ts.right.mean)}.` : null,
          ts.left.n > 0 && ts.left.mean != null ? `After left turns it rose in ${ts.left.up} of ${ts.left.n}; mean change ${pp(ts.left.mean)}.` : null,
          `${ts.tested} turns can be measured and ${ts.untested} cannot, for want of reported years on one side.`,
        ] : ["The prototype's terms are not in this release, so no turn can be measured."]}
        record={[
          { text: `Turns to the right: ${ts.right.n}; China's share rose after ${ts.right.up} of them; mean change ${ts.right.mean != null ? pp(ts.right.mean) : "—"}${ts.right.meanNet != null ? `, net of the region ${pp(ts.right.meanNet)}` : ""}.`, kind: "facts" as const },
          { text: `Turns to the left: ${ts.left.n}; China's share rose after ${ts.left.up}; mean change ${ts.left.mean != null ? pp(ts.left.mean) : "—"}${ts.left.meanNet != null ? `, net of the region ${pp(ts.left.meanNet)}` : ""}.`, kind: "facts" as const },
        ]}
        soWhat={(ts.right.mean ?? 0) > 0 ? "The buyer of the ore is set by mines, smelters and prices, not by the colour of the government. A right-wing turn that wanted to redirect exports toward the United States had nothing to redirect them with: the smelters are in China." : "On this record the direction of the turn and the direction of the ore do move together; the table says where."}
        overturn="A majority of right turns followed by a fall in China's share net of the region, or a left turn followed by a rise that the region did not share. Prices and mine openings move in the same years, so a single case proves nothing either way."
        links={[{ href: "/stage#s-timeline", label: "The politics track, six countries" }, { href: "/story/appendix#c8-index", label: "Argentina's index under Milei" }, { href: "/explore?view=buyers", label: "Who buys, on the map" }]}
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
        pictures={pictures}
        id="lending"
        verdict={verdicts.lending}
        matters="The debt-trap story is the main argument for treating Chinese finance as the lever of Chinese influence. If the trade grew while the lending collapsed, the lever and the influence are different things, and cutting off the loans would not cut off the ore."
        usual="China buys influence and resources with loans: the lending and the trade move together."
        test="Documented Chinese commitments to the twenty countries by year (AidData), against China's share of the region's reported mineral exports in the same years."
        findings={lend.peak && lend.lastCN ? [
          `Chinese commitments peaked at ${fmtMusd(lend.peak.CN)} in ${lend.peak.year} and were ${fmtMusd(lend.lastCN.CN)} in ${lend.lastCN.year}, the last year covered.`,
          peakShare != null && lastShare != null ? `China's share of the region's mineral exports: ${fmtPct(peakShare, 0)} in ${lend.peak.year}, ${fmtPct(lastShare, 0)} in ${lend.lastCN.year}.` : null,
          `US DFC and EXIM commitments in ${lend.lastCN.year}: ${fmtMusd(lend.lastCN.US)}.`,
        ] : ["No Chinese commitments in the file, so the lending cannot be set against the ore."]}
        record={[
          { text: lend.peak ? `Chinese commitments peaked at ${fmtMusd(lend.peak.CN)} in ${lend.peak.year}${peakShare != null ? `, when China took ${fmtPct(peakShare, 0)} of the region's reported mineral exports` : ""}.` : "No Chinese commitments in the file.", kind: "facts" as const },
          { text: lend.lastCN ? `In ${lend.lastCN.year}, the last year the source covers, commitments were ${fmtMusd(lend.lastCN.CN)}${lastShare != null ? ` and China's share of the ore ${fmtPct(lastShare, 0)}` : ""}.` : "", kind: "facts" as const },
          { text: lend.lastCN ? `US DFC and EXIM commitments in ${lend.lastCN.year}: ${fmtMusd(lend.lastCN.US)}.` : "", kind: "facts" as const },
        ].filter((r) => r.text)}
        soWhat="If lending bought the ore, the ore would have followed the money down. It did not: China's purchases are a market position, and the loans were a separate, shorter episode that ended before the trade peaked. The debt-trap story and the resource-grab story are two stories, not one."
        overturn="A revival of Chinese lending that the trade then follows, or a fall in China's share of the ore in the years the lending fell. The AidData series ends where the record says; later lending is not visible."
        links={[{ href: "/story#c3-iceberg", label: "The Iceberg: two ledgers" }, { href: "/story#c4-flags", label: "Loan arrives, line stays flat" }, { href: "/lab#panel", label: "The panel regression" }]}
      >
        {lend.rows.length > 0 && <Bars rows={lend.rows.map((r) => ({ year: r.year, v: r.CN }))} max={Math.max(...lend.rows.map((r) => r.CN))} color="var(--cn)" />}
      </Claim>

      <Claim
        pictures={pictures}
        id="capital"
        verdict={verdicts.capital}
        matters="Who owns the mines decides who sets the terms, pays the taxes and takes the profits. If the ownership is American while the customer is Chinese, each power is strong where the other is absent, and a policy aimed at only one of the two measures misreads the balance."
        usual="China has bought up Latin America's mining sector."
        test="Reported inward direct-investment positions held by each counterpart (IMF DIP), summed over the countries that report them, in the latest year both counterparts are reported."
        findings={cap?.USA && cap.CHN ? [
          `${cap.year}: the United States holds ${fmtMusd(cap.USA.musd)} of reported inward positions across ${cap.USA.n} countries.`,
          `Mainland China holds ${fmtMusd(cap.CHN.musd)} across ${cap.CHN.n}${cap.HKG ? `; Hong Kong SAR ${fmtMusd(cap.HKG.musd)} across ${cap.HKG.n}` : ""}.`,
          capRatio != null ? `The American stock is ${px(capRatio)} times the mainland Chinese one in the same year.` : null,
        ] : [cap ? "No year in which both counterparts report a position." : "The investment file is not in this release."]}
        record={[
          { text: cap?.USA && cap.CHN ? `${cap.year}: positions held by the United States ${fmtMusd(cap.USA.musd)} across ${cap.USA.n} reporting countries; by mainland China ${fmtMusd(cap.CHN.musd)} across ${cap.CHN.n}${cap.HKG ? `; by Hong Kong SAR ${fmtMusd(cap.HKG.musd)} across ${cap.HKG.n}` : ""}.` : "The investment file is not in this release.", kind: "facts" as const },
          { text: "These are all-sector positions: the IMF series does not split mining out, and a Chinese stake held through a third economy is counted under that economy.", kind: "facts" as const },
        ]}
        soWhat="The two powers hold different kinds of presence: China is the customer, the United States the shareholder. A policy that counts only the ore sees China winning; one that counts only the balance sheet sees the opposite. Both are looking at the same region."
        overturn="Mining-only positions showing Chinese ownership of the producing assets, or positions routed through Hong Kong and the Caribbean that, once attributed, close the gap."
        links={[{ href: "/story#c0-investment", label: "Who owns the capital" }, { href: "/routes", label: "Trade and investment" }, { href: claimHref("hongkong"), label: "The Hong Kong objection, tested" }]}
      />

      <Claim
        pictures={pictures}
        id="minerals"
        verdict={verdicts.minerals}
        matters="A rivalry over the same minerals would mean a bidding war that the host countries could play on. Two different shopping lists mean the opposite: each power can be squeezed only on the minerals it actually buys, and the region's leverage is mineral by mineral, not bloc by bloc."
        usual="The two powers compete for the same critical minerals."
        test={`China's and the US's shares of the region's reported exports, mineral by mineral, in ${minerals?.year ?? "the latest year"} (UN Comtrade, the countries reporting that year); the claim holds when each power is the larger buyer of at least one mineral${minerals && lithium && minerals.usLed[0] ? `, as it reads here: the battery metal is China's and the United States buys ${minerals.usLed[0].mineral.replace(/_/g, " ")}` : ""}.`}
        findings={minerals ? [
          `${minerals.year}: China takes the larger share in ${minerals.chinaLed.length} of ${minerals.rows.length} minerals, the United States in ${minerals.usLed.length}.`,
          lithium ? `Lithium: ${fmtShare(lithium.share_cn)} of the region's reported exports go to China, ${fmtShare(lithium.share_us)} to the United States.` : null,
          minerals.usLed[0] ? `The United States' largest lead is ${minerals.usLed[0].mineral.replace(/_/g, " ")}: ${fmtShare(minerals.usLed[0].share_us)} against ${fmtShare(minerals.usLed[0].share_cn)} to China.` : "No mineral has the United States as the larger buyer.",
        ] : ["No mineral shares in this release."]}
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
        pictures={pictures}
        id="prices"
        verdict={verdicts.prices}
        matters="The headline growth of the region's mineral exports is quoted as evidence of a geopolitical shift. If value followed the metal price up and down, the shift is in the shares, not in the value, and the policy conversation should be about who buys, not how much it is worth."
        usual="The region's mineral exports have grown because China's demand pulled them."
        test={`The region's reported export value by year (summed world totals) against the ${prices?.series ?? "copper price"} in the same years; the correlation across the years both are known, and the years that mark the shape.`}
        findings={prices ? [
          `Export value: ${fmtMusd(prices.first.value)} in ${prices.first.year}, ${fmtMusd(prices.peak.value)} at the ${prices.peak.year} peak, ${fmtMusd(prices.last.value)} in ${prices.last.year}.`,
          `The ${prices.key} price: ${px(prices.first.price)} ${prices.unit} in ${prices.first.year}, ${px(prices.peak.price)} in the peak year ${prices.peak.year}, ${px(prices.last.price)} in ${prices.last.year}.`,
          prices.corr != null ? `Across the ${prices.rows.length} years both are known, value and price correlate at ${prices.corr.toFixed(2)}.` : null,
        ] : ["No price series in this release."]}
        record={prices ? [
          { text: `${prices.first.year}: ${fmtMusd(prices.first.value)} at ${px(prices.first.price)} ${prices.unit}; peak ${prices.peak.year}: ${fmtMusd(prices.peak.value)} at ${px(prices.peak.price)}${prices.trough && prices.trough.year !== prices.last.year ? `; ${prices.trough.year}: ${fmtMusd(prices.trough.value)} at ${px(prices.trough.price)}` : ""}; ${prices.last.year}: ${fmtMusd(prices.last.value)} at ${px(prices.last.price)}.`, kind: "facts" as const },
          { text: `Correlation of value with the price across ${prices.rows.length} years: ${prices.corr != null ? prices.corr.toFixed(2) : "—"}.`, kind: "facts" as const },
        ] : [{ text: "No price series in this release.", kind: "facts" as const }]}
        soWhat="The value rose and fell with the metal, as a commodity exporter's value does. What changed hands politically is the share: China's part of a total that prices set. A chart of export value is a chart of the copper price with a Latin American label."
        overturn="Volumes rising independently of price, or value growth in years the price fell. An implied-volume decomposition would say how much; it is a model and is not drawn here."
        links={[{ href: "/story#c2-prices", label: "Price or politics?" }, { href: "/story#c2-destinations", label: "Where the region's minerals went" }]}
      />

      <Claim
        pictures={pictures}
        id="three"
        verdict={verdicts.three}
        matters="The region that leans to China in the headlines is a handful of copper and iron exporters. Policy aimed at twenty countries as one bloc misses that the other seventeen barely sell China anything, and that a change in one of the three moves the whole regional number."
        usual="Latin America as a region has turned to China as its mineral customer."
        test={`Each country's reported exports to China in the latest year with China cells for at least ten countries${conc ? ` (${conc.year})` : ""}, as a share of the summed cells.`}
        findings={conc ? [
          `${list(conc.top3.map((r) => name(r.iso3)))} carry ${fmtPct(conc.top3Share, 0)} of the ${fmtMusd(conc.total)} of exports to China in ${conc.year}.`,
          `The largest, ${name(conc.top3[0].iso3)}, alone carries ${fmtPct(conc.top3[0].share, 0)}; the other ${conc.n - 3} reporting countries together ${fmtPct(1 - conc.top3Share, 0)}.`,
          `${conc.n} of the ${COUNTRY_COUNT_WORD} countries report a China cell for ${conc.year}.`,
        ] : ["No China cells in the file."]}
        record={conc ? [
          { text: `${conc.year}: ${fmtMusd(conc.total)} of exports to China across ${conc.n} reporting countries; the three largest, ${conc.top3.map((r) => `${name(r.iso3)} ${fmtPct(r.share, 0)}`).join(", ")}, carry ${fmtPct(conc.top3Share, 0)} of it.`, kind: "facts" as const },
          { text: `The other ${conc.n - 3} countries together: ${fmtPct(1 - conc.top3Share, 0)}.`, kind: "facts" as const },
        ] : [{ text: "No China cells in the file.", kind: "facts" as const }]}
        soWhat="The regional number is three national numbers. Chile's copper, Brazil's iron and niobium and Peru's copper decide it; Central America and the Caribbean coast are in the same statistics and almost absent from the trade."
        overturn="A spread of exports to China across more reporters, with the top three below three quarters of the total."
        links={[{ href: "/explore?view=buyers", label: "Who buys, country by country" }, { href: "/routes", label: "Where the region's exports go" }]}
      />

      <Claim
        pictures={pictures}
        id="attention"
        verdict={verdicts.attention}
        matters="Policy that reacts to a narrative rather than to a balance sheet arrives late and aims at a past position. If Washington's attention peaked when Beijing's money had already fallen, the measures it produced were calibrated to a presence that no longer existed in that form."
        usual="US policy responded to Chinese lending as it grew."
        test={`US policy documents on the region's minerals per year (Congress.gov and the Federal Register) against Chinese commitments in the same year${att?.span ? `, ${att.span[0]}–${att.span[1]}` : ""}.`}
        findings={att?.peakMoney && att.peakDocs ? [
          `Chinese commitments peaked in ${att.peakMoney.year} at ${fmtMusd(att.peakMoney.cn_musd!)}; Washington produced ${att.peakMoney.policy_docs} policy documents that year.`,
          `Policy documents peaked in ${att.peakDocs.year} at ${att.peakDocs.policy_docs}, ${attGap != null && attGap > 0 ? `${years(attGap)} after the money` : attGap === 0 ? "the same year as the money" : `${years(-(attGap ?? 0))} before the money`}, when commitments were ${fmtMusd(att.peakDocs.cn_musd!)}.`,
          att.corr != null ? `Across the ${att.years} years both series cover, documents and Chinese money correlate at ${att.corr.toFixed(2)}.` : null,
        ] : ["No attention series in this release."]}
        record={att ? [
          { text: att.peakMoney ? `Chinese commitments peaked in ${att.peakMoney.year} (${fmtMusd(att.peakMoney.cn_musd!)}), when Washington produced ${att.peakMoney.policy_docs} documents.` : "", kind: "facts" as const },
          { text: att.peakDocs ? `Policy documents peaked in ${att.peakDocs.year} (${att.peakDocs.policy_docs}), when Chinese commitments were ${fmtMusd(att.peakDocs.cn_musd!)}.` : "", kind: "facts" as const },
          { text: `Correlation of documents with Chinese money across the ${att.years} years both are known: ${att.corr != null ? att.corr.toFixed(2) : "—"}.`, kind: "facts" as const },
        ].filter((r) => r.text) : [{ text: "No attention series in this release.", kind: "facts" as const }]}
        soWhat="The policy response is counter-cyclical to the thing it describes: the bills and rules came when the lending had already fallen to a fraction of its peak. Attention tracks the narrative of Chinese presence, not its balance sheet."
        overturn="Policy counts that follow the money with a lag of a year or two once the Chinese series extends past 2021, or a different measure of attention (hearings, appropriations) that peaks with the lending."
        links={[{ href: "/lab#attention", label: "Attention and money" }, { href: "/story#c1-attention", label: "Attention and the cheque book" }]}
      />

      <section className="card mt-8 px-4 py-4 sm:px-6 sm:py-5" aria-labelledby="more-h">
        <div className="flex flex-wrap items-center gap-2"><p className="eyebrow">Further claims</p><LayerLabel layer="interpretation" /></div>
        <h2 id="more-h" className="serif mt-1 text-xl font-bold leading-tight sm:text-2xl">{moreWord} further claims</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">Tested the same way, on the same record, with the same rules. They sit on their own page because they are weaker, more technical, robustness checks on the claims above, or open on this record; the numbering carries on from here.</p>
        <ol className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {MORE_CLAIMS.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span className="font-mono text-[11px] text-ink-3">{String(claimNumber(c.id)).padStart(2, "0")}</span>
              <span className="min-w-0">
                <Link href={claimHref(c.id)} className="underline decoration-dotted">{c.headline}</Link>
                <span className="block text-[0.78rem] text-ink-3">{c.stake}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-3"><Link href="/contested/more" className="btn btn-md btn-primary no-underline">Read the further claims</Link></div>
      </section>

      <VerdictRules />
    </div>
  );
}
