"use client";

import Link from "next/link";
import { LayerLabel } from "@/components/ui/Badges";
import { COUNTRY_COUNT_WORD } from "@/lib/constants";
import { tally, type MeasureVerdict } from "@/lib/verdicts";
import { Exhibit, StepCard } from "./Chapter";
import { Door } from "./Chapter";
import { VerdictTable } from "./Verdicts";

/**
 * The conclusion: who is winning, by the record's own measures, with the reading that follows from them labelled as
 * interpretation; and the opening of the next topic. The numbers are the whole-picture chapter's; the prose is
 * AI-drafted and says so.
 */
export function Ch10Winning({ verdicts }: { verdicts: MeasureVerdict[] }) {
  const t = tally(verdicts);
  const trade = verdicts.find((v) => v.id === "trade");
  const inv = verdicts.find((v) => v.id === "investment");
  return (
    <>
      <StepCard>
        <p>Every chapter has asked one question of one record. Put the measures side by side and the question in the title gets an answer with its conditions attached: each row below is the latest year the measure holds, the actor it favours, and what keeps it from settling the matter. The reading under the table is an interpretation, drafted by an AI session from these numbers and labelled so.</p>
      </StepCard>
      <Exhibit id="c10-verdicts" title="The measures, side by side" layer="facts" sources={["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "imf_dip", "unga_votes"]} ids={["flows:trade:all", "flows:finance", "investment_position:inward", "index_component:diplomatic_alignment", "index_value:influence:*"]} note="Each measure in its latest year, summed or averaged over the countries that carry a value, with the count; the index is a model output and is marked so. 'Favours' is the larger of the two figures and nothing more.">
        <VerdictTable verdicts={verdicts} />
      </Exhibit>
      <div className="mt-6 card px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2"><p className="eyebrow">Who is winning</p><LayerLabel layer="interpretation" /><span className="text-[11px] text-ink-3">AI-drafted, not yet reviewed by the owner</span></div>
        <div className="prose-doc mt-2 max-w-3xl text-sm leading-relaxed">
          <p><strong>On what the region sells and how it votes, China.</strong> {trade ? trade.statement : ""} The votes went China&apos;s way before the ore did and have stayed there, so the political alignment is not a purchase the trade made; it is older and broader than the minerals.</p>
          <p><strong>On what is owned, the United States, where the surveys reach.</strong> {inv && inv.favours !== "unknown" ? `${inv.statement} ` : "Where the IMF positions have been ingested, the American-held stock is several times the Chinese-held one on the countries' own surveys. "}The capital that was built up over a century does not move at the speed of the ore, and the record shows the two sides measuring the same Chinese stock very differently.</p>
          <p><strong>On the cheques, China on paper and nobody lately.</strong> The documented Chinese commitments dwarf the US authorisations over the record, but the large years are a decade old and the Chinese series ends where its source ends; the US money is small and recent. The chapter on the iceberg shows why the headline sum is not the whole of Beijing&apos;s money, and the swap drawdowns to Argentina sit apart from all of it.</p>
          <p><strong>So: {t.CN > t.US ? "China on more measures, the United States on the deepest one" : t.US > t.CN ? "the United States on more measures, China on the flows" : "a draw on the measures, split by kind"}.</strong> The flows (ore, votes, recent cheques) favour China; the stock (capital) favours the United States; the composite index, which averages flows and a stock of debt, leans China in most of the {COUNTRY_COUNT_WORD} countries. Whoever asks &ldquo;who is winning&rdquo; has to say which of these they mean, and this site keeps them apart so the question stays answerable. What the record cannot see, the last chapter lists; what the literature says about the same questions, and where the record agrees, is on the <Link href="/what-we-know" className="underline">What do we know</Link> page.</p>
        </div>
      </div>
      <div className="mt-6 card px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2"><p className="eyebrow">The next topic</p><LayerLabel layer="interpretation" /></div>
        <div className="prose-doc mt-2 max-w-3xl text-sm leading-relaxed">
          <p><strong>What the ore becomes.</strong> This record stops at the border: it sees where the concentrate and the carbonate go, not what is made of them, or by whom. The next question is the step after export, refining and processing, where the share held by China is larger than any share in this record and where the sourcing rules of the United States and its partners (the Inflation Reduction Act&apos;s content rules, the Minerals Security Partnership) are meant to bite. The datasets for it exist (refinery capacity by country, the rules&apos; text and their effective dates, the trade in refined products under their own HS codes) and the methods on this site carry over: the same shares, the same event windows, the same labels.</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Door href="/what-we-know" title="What do we know" text="The literature set against the record, claim by claim." primary />
          <Door href="/stage" title="Two powers, one stage" text="The team's prototype: 33 states, two baskets, five acts, the hypothesis cards." />
          <Door href="/denial" title="Denial without Substitution" text="The companion project's answer to why: 31 studies, 1,076 events, 20 country verdicts." />
          <Door href="/mineral" title="The minerals, one file each" text="Where the record stops: the ore at the border, by mineral." />
        </div>
      </div>
    </>
  );
}
