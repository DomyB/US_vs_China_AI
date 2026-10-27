"use client";

import { ParityChart } from "@/components/insights/ParityChart";
import { fmtMusd, fmtPct } from "@/lib/format";
import type { InsightCountry } from "@/lib/types";
import { Exhibit } from "../Chapter";

/** The parity_gap contrast of insights.json: what would have to switch buyers each year, at constant totals, for equal shares. */
export interface ParityGap { musd: number; multiple_of_us: number | null; top_mineral: string | null; reachable_with_top_mineral: boolean | null; year: number; cn_musd: number; us_musd: number }

export const parityGapOf = (c: InsightCountry | undefined): ParityGap | undefined => c?.contrasts.find((x) => x.id === "parity_gap") as ParityGap | undefined;

/** Chile's copper parity bar (chapter 6's second exhibit, in the appendix): the latest year's exports to the two buyers as one split bar. */
export function ChileParityBar({ parity }: { parity: ParityGap }) {
  const both = parity.cn_musd + parity.us_musd;
  const cnShare = both > 0 ? parity.cn_musd / both : null;
  return (
    <Exhibit
      id="c6-parity"
      title="The copper parity bar"
      layer="facts"
      sources={["un_comtrade"]}
      ids={["flow_trade:CHL:all:latest", `flow_trade:CHL:${parity.top_mineral ?? "all"}:latest`]}
      asks="How far is Chile's ore from being bought equally by the two powers? One bar split by buyer, at the latest year's totals, turns the gap into a length; it is a thought experiment at constant totals, not a forecast."
      how="The bar is the latest year's mineral exports to the two buyers in proportion, red for China and blue for the United States; the sentence beneath turns the difference into the sum that would have to switch each year, as a multiple of what the United States bought."
      findings={[
        `${fmtMusd(parity.cn_musd)} to China against ${fmtMusd(parity.us_musd)} to the United States in ${parity.year}.`,
        cnShare !== null ? `China's segment is ${fmtPct(cnShare, 0)} of the bar.` : null,
        parity.multiple_of_us !== null ? `${fmtMusd(parity.musd)} a year would have to switch, ${parity.multiple_of_us.toFixed(1)} times what the United States bought.` : `${fmtMusd(parity.musd)} a year would have to switch.`,
      ]}
      findingsKind="facts"
      says="The red segment is the larger by a wide margin, so equal shares would need the United States to buy a multiple of what it buys now. The sum is a measure of distance, not a plan."
      note="Arithmetic at constant totals; redirected exports need buyers, smelters, ships and contracts the arithmetic ignores."
    >
      <div className="space-y-2 text-sm">
        <div className="flex h-7 w-full overflow-hidden rounded-sm border border-outline">
          <div className="bg-cn" style={{ width: `${cnShare !== null ? cnShare * 100 : 0}%` }} title={`China ${fmtMusd(parity.cn_musd)}`} />
          <div className="bg-us" style={{ width: `${cnShare !== null ? (1 - cnShare) * 100 : 0}%` }} title={`United States ${fmtMusd(parity.us_musd)}`} />
        </div>
        <p>{fmtMusd(parity.cn_musd)} to China, {fmtMusd(parity.us_musd)} to the United States in {parity.year}. For equal shares <strong>{fmtMusd(parity.musd)} a year would have to switch</strong>{parity.multiple_of_us !== null ? `, ${parity.multiple_of_us.toFixed(1)} times what the United States bought` : ""}{parity.reachable_with_top_mineral && parity.top_mineral ? `; ${parity.top_mineral} alone could cover it` : ""}.</p>
      </div>
    </Exhibit>
  );
}

/**
 * The parity ranking (chapter 7's first exhibit, in the appendix): one bar per country where China buys more, at constant
 * totals. `parity` is Chile's gap, named in the reading beside the chart.
 */
export function ParityRanking({ countries, parity }: { countries: InsightCountry[]; parity: ParityGap | undefined }) {
  const gaps = countries.flatMap((c) => { const g = parityGapOf(c); return g ? [{ name: c.name, ...g }] : []; }).sort((a, b) => b.musd - a.musd);
  const top = gaps[0] ?? null;
  const reachable = gaps.filter((g) => g.reachable_with_top_mineral).length;
  const withMultiple = gaps.filter((g) => g.multiple_of_us !== null) as (typeof gaps[number] & { multiple_of_us: number })[];
  const largestMultiple = withMultiple.length ? withMultiple.reduce((a, b) => (b.multiple_of_us > a.multiple_of_us ? b : a)) : null;
  return (
    <Exhibit
      id="c7-parity"
      title="What would have to change hands for the two buyers to be equal"
      layer="facts"
      sources={["un_comtrade"]}
      ids={countries.map((x) => `flow_trade:${x.iso3}:all:latest`)}
      asks="In each country, how much ore would have to change buyers for China and the United States to be equal? One bar per country at constant totals turns the gap into a yearly sum: a thought experiment, not a forecast."
      how="One bar per country where China buys more, longest first: its length is the yearly export value that would have to move from China to the United States, the label beside it the same sum as a multiple of what the United States bought; the table beneath adds the largest mineral and whether it alone could cover the gap. A country with no reported trade, or a gap too small to be more than noise, has no bar."
      findings={[
        top ? `The longest bar is ${top.name}'s: ${fmtMusd(top.musd)} a year in ${top.year}${top.multiple_of_us !== null ? `, ${top.multiple_of_us.toFixed(1)} times what the United States bought` : ""}.` : null,
        gaps.length ? `${reachable} of the ${gaps.length} countries with a computed gap could cover it with their largest mineral alone.` : null,
        largestMultiple ? `The largest multiple is ${largestMultiple.name}'s, ${largestMultiple.multiple_of_us.toFixed(0)} times US purchases.` : null,
      ]}
      findingsKind="facts"
      says={parity && parity.multiple_of_us !== null ? `A long bar is a big exporter and a large multiple a buyer that barely bought: Chile's bar is long yet its multiple is only ${parity.multiple_of_us.toFixed(1)}, while short bars can carry far larger multiples where the United States bought almost nothing. Where the top mineral alone covers the gap, the switch is one commodity's contracts, not a whole trade.` : "A long bar is a big exporter and a large multiple a buyer that barely bought; the two do not go together. Where the top mineral alone covers the gap, the switch is one commodity's contracts, not a whole trade."}
      note="Arithmetic at constant totals: (China − US) ÷ 2 of each country's latest reported mineral exports; whether the top mineral alone could carry it. Redirected exports need buyers, smelters, ships and contracts the arithmetic ignores."
    >
      <ParityChart countries={countries} />
    </Exhibit>
  );
}
