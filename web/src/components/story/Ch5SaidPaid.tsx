"use client";

import Link from "next/link";
import { useState } from "react";
import { MineralsTalk } from "@/components/insights/MineralsTalk";
import { WordsVsMoney } from "@/components/insights/WordsVsMoney";
import { COUNTRY_NAMES } from "@/lib/constants";
import { fmtPct } from "@/lib/format";
import type { InsightCountry, InsightRegion, StatementBloc, StatementRecord } from "@/lib/types";
import { Exhibit, StepCard } from "./Chapter";

/** One bar per country: positive positions toward the United States to the left, toward China to the right, negatives as notches, the balance in the handle. */
function HedgingMeter({ hedgers }: { hedgers: InsightRegion["hedgers"] }) {
  const rows = [...hedgers].sort((a, b) => b.balance - a.balance);
  const max = Math.max(...rows.map((r) => Math.max(r.pos_us, r.pos_cn)), 1);
  const w = (n: number) => `${(n / max) * 100}%`;
  return (
    <ul className="space-y-2 text-sm" aria-label="Hedging meter">
      {rows.map((r) => (
        <li key={r.iso3} className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-2">
          <span className="truncate text-xs font-semibold">{COUNTRY_NAMES[r.iso3] ?? r.iso3}</span>
          <span className="flex items-center justify-end gap-1" title={`${r.pos_us} positive, ${r.neg_us} negative toward the United States`}>
            {r.neg_us > 0 && <span className="text-[10px] text-ink-3">−{r.neg_us}</span>}
            <span className="h-3 rounded-l-sm bg-us" style={{ width: w(r.pos_us) }} />
            <span className="w-4 text-right text-[10px] tabular-nums text-ink-2">{r.pos_us}</span>
          </span>
          <span className="rounded-full border border-outline bg-card text-center text-[11px] font-bold tabular-nums" title={`balance ${r.balance.toFixed(2)} over ${r.n_executive} executive statements`}>{r.balance.toFixed(2)}</span>
          <span className="flex items-center gap-1" title={`${r.pos_cn} positive, ${r.neg_cn} negative toward China`}>
            <span className="w-4 text-[10px] tabular-nums text-ink-2">{r.pos_cn}</span>
            <span className="h-3 rounded-r-sm bg-cn" style={{ width: w(r.pos_cn) }} />
            {r.neg_cn > 0 && <span className="text-[10px] text-ink-3">−{r.neg_cn}</span>}
          </span>
        </li>
      ))}
      <li className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem_minmax(0,1fr)] gap-2 text-[10px] text-ink-3"><span /><span className="text-right">positive on the United States</span><span className="text-center">balance</span><span>positive on China</span></li>
    </ul>
  );
}

function QuoteCard({ q, receipt }: { q: StatementRecord; receipt: string | null }) {
  const [flip, setFlip] = useState(false);
  const stance = (s: string) => s.replace(/_/g, " ");
  return (
    <li className="card p-3 text-sm">
      <button type="button" className="w-full text-left" onClick={() => setFlip((f) => !f)} aria-pressed={flip} aria-label={flip ? "Show the quote" : "Show the receipts"}>
        {!flip ? (
          <>
            <p className="serif leading-snug" lang={q.language}>“{(q.quote_original ?? q.quote_en ?? q.summary_en).slice(0, 200)}{(q.quote_original ?? q.quote_en ?? q.summary_en).length > 200 ? "…" : ""}”</p>
            <p className="mt-2 text-[11px] text-ink-3">{q.speaker.name}, {q.speaker.role} · {q.date} · {q.source.name} · <span className="font-mono">{q.id}</span></p>
            <p className="mt-1 text-[11px] text-ink-3">Coded: toward the US <strong>{stance(q.stance.us)}</strong>, toward China <strong>{stance(q.stance.cn)}</strong> · dataset coding, not validated · tap for the receipts</p>
          </>
        ) : (
          <>
            <p className="eyebrow !text-[0.62rem]">Paid · {COUNTRY_NAMES[q.country] ?? q.country}</p>
            <p className="mt-1 leading-snug text-ink-2">{receipt ?? "No reported trade row for this country in the latest year."}</p>
            <p className="mt-2 text-[11px] text-ink-3">Shown as coinciding with the sentence, not as its effect · tap for the quote</p>
          </>
        )}
      </button>
    </li>
  );
}

export function Ch5SaidPaid({ countries, byBloc, hedgers, quotes }: { countries: InsightCountry[]; byBloc: StatementBloc[]; hedgers: InsightRegion["hedgers"]; quotes: StatementRecord[] }) {
  const receipt = (iso3: string) => {
    const c = countries.find((x) => x.iso3 === iso3);
    if (!c?.trade) return null;
    return `In ${c.trade.year}, ${fmtPct(c.trade.share_cn ?? 0)} of ${c.name}'s reported mineral exports went to China and ${fmtPct(c.trade.share_us ?? 0)} to the United States.`;
  };
  const excluded = countries.filter((c) => c.words?.executive_pooled && !hedgers.some((h) => h.iso3 === c.iso3) && (c.words.n_executive ?? 0) > 0).map((c) => c.name);
  return (
    <div className="space-y-6">
      <StepCard>
        <p><strong>Read this chapter smaller than the others.</strong> Stance is coded under the dataset&apos;s codebook by the owner&apos;s AI-assisted collection and is not validated against a human judgement; some countries rest on three statements. Shares are facts; the words are a reading of them.</p>
      </StepCard>
      <Exhibit title="Words against trade, country by country" layer="model" sources={["manual_statements", "un_comtrade"]} ids={["statement:stance_cn:country:latest-years", "statement:stance_us:country:latest-years", "flow_trade:share_cn:country:latest", "flow_trade:share_us:country:latest"]} explore={{ href: "/lab#words", label: "Open in the Lab" }} note="Executives' coded stance toward the chosen power (−1 to +1, pooled over the latest statement years) against the share of mineral exports going there; bubble area is the country's mineral exports. The stance is the dataset's own coding; the share is reported trade.">
        <WordsVsMoney countries={countries} byBloc={byBloc} />
      </Exhibit>
      <div className="grid gap-6 lg:grid-cols-2">
        <Exhibit title="Hedging: who praises both" layer="facts" sources={["manual_statements"]} ids={["statement:stance_counts:country:executive"]} note={`Counts of coded positions by domestic executives over every year in the dataset; 1 = equally warm to both, 0 = one-sided.${excluded.length ? ` Excluded by the rule (no positive position on one of the two): ${excluded.join(", ")}.` : ""}`}>
          <HedgingMeter hedgers={hedgers} />
        </Exhibit>
        <Exhibit title="Said and paid: the quotes beside the receipts" layer="interp" sources={["manual_statements", "un_comtrade"]} ids={quotes.map((q) => `statement:${q.id}`)} note="A statement by a domestic executive is set beside that country's latest reported trade shares. The pairing is editorial; both halves are facts; nothing here claims the words caused the trade.">
          <ul className="grid gap-3 sm:grid-cols-2">{quotes.map((q) => <QuoteCard key={q.id} q={q} receipt={receipt(q.country)} />)}</ul>
        </Exhibit>
      </div>
      <Exhibit title="Talks lithium, ships copper: what is mentioned against what is sold" layer="facts" sources={["manual_statements", "un_comtrade"]} ids={["statement:minerals:country", "flow_trade:country:mineral:latest"]} note="Mentions are the minerals named in a country's executives' statements; value is the latest reported export value by mineral.">
        <MineralsTalk countries={countries} />
      </Exhibit>
      <p className="text-xs text-ink-3">Every record, with its original-language quote, is on the <Link href="/region" className="underline">region page</Link> and in each case file&apos;s Words tab.</p>
    </div>
  );
}
