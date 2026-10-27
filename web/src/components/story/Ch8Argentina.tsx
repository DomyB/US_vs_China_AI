"use client";

import Link from "next/link";
import { fmtMusd, fmtShare } from "@/lib/format";
import { STORY_SINCE, absentPartnerMinerals, type LedgerSide, type TradeReceipt } from "@/lib/story";
import type { InsightCountry, StatementRecord } from "@/lib/types";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";
import { MoneyDefs, WideFigure } from "./Ch3Iceberg";
import type { Receipt } from "./ColdOpen";

type Event = { id: string; date: string; title: string; status: string; type: string };

/** The ledger page's money columns: documented, lower-confidence (dots), swap drawdowns (hatch) and the US sliver with an outlined framework block. Captions are 10 viewBox units (8.8 px in the 58% column at 1366, 12.5 px in the phone's scroll box). */
function MoneyColumns({ cn, us, framework }: { cn: LedgerSide; us: LedgerSide; framework: Event | null }) {
  const max = Math.max(cn.documented_musd, cn.undocumented_musd, cn.swap_musd, 1);
  const h = (m: number) => Math.max(2, (m / max) * 170);
  const base = 240, defs = "arg-money";
  return (
    <WideFigure minWidth="min-w-[800px]">
      <svg viewBox="0 0 640 300" className="w-full" role="img" aria-label={`Argentina: Chinese documented commitments ${fmtMusd(cn.documented_musd)}, lower-confidence ${fmtMusd(cn.undocumented_musd)}, swap drawdowns ${fmtMusd(cn.swap_musd)}; US documented ${fmtMusd(us.documented_musd)}${framework ? `; a US swap framework recorded as a draft event with no drawn amount` : ""}.`}>
        <MoneyDefs id={defs} />
        <g>
          <rect x={40} y={base - h(cn.documented_musd)} width={90} height={h(cn.documented_musd)} fill="var(--cn)" rx="3" />
          <text x={85} y={base - h(cn.documented_musd) - 6} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{fmtMusd(cn.documented_musd)}</text>
          <text x={85} y={base + 14} textAnchor="middle" fontSize="10" className="fill-ink-2">documented</text><text x={85} y={base + 27} textAnchor="middle" fontSize="10" className="fill-ink-3">to {cn.last_year}</text>
          <rect x={150} y={base - h(cn.undocumented_musd)} width={90} height={h(cn.undocumented_musd)} fill={`url(#${defs}-dots)`} stroke="var(--cn)" strokeWidth="1.2" rx="3" />
          <text x={195} y={base - h(cn.undocumented_musd) - 6} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{fmtMusd(cn.undocumented_musd)}</text>
          <text x={195} y={base + 14} textAnchor="middle" fontSize="10" className="fill-ink-2">lower confidence</text><text x={195} y={base + 27} textAnchor="middle" fontSize="10" className="fill-ink-3">{cn.undocumented_n} records</text>
          <rect x={260} y={base - h(cn.swap_musd)} width={90} height={h(cn.swap_musd)} fill={`url(#${defs}-hatch)`} stroke="var(--cn)" strokeWidth="1.2" rx="3" />
          <text x={305} y={base - h(cn.swap_musd) - 6} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{fmtMusd(cn.swap_musd)}</text>
          <text x={305} y={base + 14} textAnchor="middle" fontSize="10" className="fill-ink-2">swap drawdowns</text><text x={305} y={base + 27} textAnchor="middle" fontSize="10" className="fill-ink-3">{cn.swap_n} records</text>
          <text x={195} y={16} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-ink">CHINA · three ledgers, never summed</text>
        </g>
        <line x1={390} y1={40} x2={390} y2={base + 20} stroke="var(--rule-2)" strokeDasharray="4 3" />
        <g>
          <text x={520} y={16} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-ink">UNITED STATES</text>
          <rect x={430} y={base - h(us.documented_musd)} width={80} height={h(us.documented_musd)} fill="var(--us)" rx="2" />
          <text x={470} y={base - h(us.documented_musd) - 6} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{fmtMusd(us.documented_musd)}</text>
          <text x={470} y={base + 14} textAnchor="middle" fontSize="10" className="fill-ink-2">DFC and EXIM</text><text x={470} y={base + 27} textAnchor="middle" fontSize="10" className="fill-ink-3">to {us.last_year}</text>
          {framework && (
            <>
              <rect x={535} y={base - 120} width={80} height={120} fill="none" stroke="var(--us)" strokeWidth="1.5" strokeDasharray="5 3" rx="3" />
              <text x={575} y={base - 126} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-ink">framework</text>
              <text x={575} y={base + 14} textAnchor="middle" fontSize="10" className="fill-ink-2">no drawdown recorded</text>
              <text x={575} y={base + 27} textAnchor="middle" fontSize="10" className="fill-ink-3">draft event · {framework.date.slice(0, 7)}</text>
            </>
          )}
        </g>
        <line x1={30} y1={base} x2={620} y2={base} stroke="var(--outline)" strokeWidth="1.5" />
      </svg>
    </WideFigure>
  );
}

/** Argentina's chapter: the sentence and its receipts, say, pay and ship, the money columns, the voices. The influence index and its trajectory are in the appendix (/story/appendix#c8-index). */
export function Ch8Argentina({ arg, quote, receipts, pairingNote, cn, us, framework, lithium, gold, voices }: { arg: InsightCountry; quote: StatementRecord | null; receipts: Receipt[]; pairingNote: string; cn: LedgerSide; us: LedgerSide; framework: Event | null; lithium: TradeReceipt | null; gold: { musd: number; year: number; partners_absent: boolean } | null; voices: StatementRecord[] }) {
  const words = arg.words.executive_pooled;
  const hedge = arg.contrasts.find((c) => c.id === "hedging") as { balance: number; pos_cn: number; pos_us: number; neg_cn: number; neg_us: number } | undefined;
  const parity = arg.contrasts.find((c) => c.id === "parity_gap") as { musd: number; multiple_of_us: number; top_mineral: string; reachable_with_top_mineral: boolean; year: number } | undefined;
  const swapYears = cn.by_year.filter((y) => y.swap_musd > 0).length;
  // the swap rows are one AidData row per year of the same renewed line, summed as recorded; the largest year is printed beside the sum
  const swapPeak = cn.by_year.reduce<LedgerSide["by_year"][number] | null>((a, b) => (b.swap_musd > (a?.swap_musd ?? 0) ? b : a), null);
  // a mineral inside the reported total with no partner row (Argentina's gold) is named, so the shares say what they are shares of
  const absentMinerals = absentPartnerMinerals(arg.trade);
  const absentClause = absentMinerals && absentMinerals.musd > 0 ? `; ${fmtMusd(absentMinerals.musd)} of it, ${absentMinerals.minerals.join(" and ")}, has no partner row: absent, not zero` : "";
  return (
    <div className="space-y-6">
      {quote && (
        <figure className="card p-4 sm:p-6">
          <blockquote lang={quote.language} className="serif text-xl leading-snug sm:text-2xl">“{quote.quote_original ?? quote.quote_en}”</blockquote>
          <figcaption className="mt-2 text-xs text-ink-3">{quote.speaker.name}, {quote.speaker.role} · {quote.date} · {quote.source.name} · {quote.source.verification.replace(/_/g, " ")} · <span className="font-mono">{quote.id}</span></figcaption>
          <ol className="mt-4 space-y-1">
            {receipts.map((r) => (
              <li key={r.label} className="receipt flex flex-wrap items-baseline gap-x-3 text-xs sm:text-sm">
                <span className="text-ink-2">{r.label} · {r.window}</span>
                <span className={r.outlined ? "receipt-outline" : "font-bold"}>{r.value}</span>
                <span className="text-[11px] text-ink-3">{r.source}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] leading-snug text-ink-3">{pairingNote}</p>
        </figure>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="eyebrow">Say</p>
          <p className="mt-1 text-sm text-ink-2">Executives {words.US ? `${words.US.mean >= 0 ? "+" : ""}${words.US.mean.toFixed(2)} toward Washington (${words.US.n} coded, ${words.US.years[0]}–${words.US.years[1]})` : "no coded position toward Washington"} and {words.CN ? `${words.CN.mean >= 0 ? "+" : ""}${words.CN.mean.toFixed(2)} toward Beijing (${words.CN.n} coded)` : "none toward Beijing"}{hedge ? `; hedging balance ${hedge.balance.toFixed(2)} (${hedge.pos_us} positive on the US, ${hedge.pos_cn} on China, ${hedge.neg_us + hedge.neg_cn} negatives)` : ""}. Dataset coding, not validated.</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Pay</p>
          <p className="mt-1 text-sm text-ink-2">US documented money {fmtMusd(arg.finance.us_2015_21)} ({arg.finance.windows.CN[0]}–{arg.finance.windows.CN[1]}){arg.finance.us_2022_24 > 0 ? ` and ${fmtMusd(arg.finance.us_2022_24)} (${arg.finance.windows.US_after[0]}–${arg.finance.windows.US_after[1]})` : `, none on record for ${arg.finance.windows.US_after[0]}–${arg.finance.windows.US_after[1]}`} vs Chinese {fmtMusd(arg.finance.cn_2015_21)} ({arg.finance.windows.CN[0]}–{arg.finance.windows.CN[1]}); swap drawdowns {fmtMusd(cn.swap_musd)} shown apart.</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Ship</p>
          <p className="mt-1 text-sm text-ink-2">{arg.trade ? `${arg.trade.share_us === null ? "no United States partner row (absent, not zero)" : `${fmtShare(arg.trade.share_us)} of mineral exports to the United States`} and ${arg.trade.share_cn === null ? "no China partner row (absent, not zero)" : `${fmtShare(arg.trade.share_cn)} to China`} in ${arg.trade.year} (${fmtMusd(arg.trade.total_musd)} in total${absentClause})` : "no reported trade"}{lithium && lithium.CN !== null ? `; lithium ${fmtMusd(lithium.CN)} of ${fmtMusd(lithium.total)} to China` : ""}.</p>
        </div>
      </div>
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit id="c8-money" title="Argentina's money, three ledgers and a sliver" layer="facts" sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations"]} ids={["flow_finance:ARG:CN", "flow_finance:ARG:US", "anomaly_flag:ARG-rescue_lending-*", framework ? `event:${framework.id}` : ""].filter(Boolean)} explore={{ href: "/country/ARG?tab=actions", label: "Open Argentina's case file" }} asks="How much Chinese money reached Argentina, on what footing, and how much American? Four columns kept apart show the ledgers a single total would hide." how="Each column is one ledger, its height against the tallest: solid red, documented Chinese commitments; dotted, lower-confidence amounts; hatched, central-bank swap drawdowns; solid blue, DFC and EXIM authorisations; the dashed outline is the 2025 US swap framework, an event with no drawn amount and so no height to read. The columns are never added together." findings={[
            `Documented Chinese commitments stand at ${fmtMusd(cn.documented_musd)}${cn.last_year ? `, ${STORY_SINCE} to ${cn.last_year}` : ""}; the US column holds ${fmtMusd(us.documented_musd)}${us.last_year ? ` to ${us.last_year}` : ""}`,
            `${cn.undocumented_n > 0 ? `The lower-confidence column holds ${fmtMusd(cn.undocumented_musd)} in ${cn.undocumented_n} record${cn.undocumented_n === 1 ? "" : "s"}` : "The lower-confidence column has no record"}; the swap column ${cn.swap_n > 0 ? `holds ${fmtMusd(cn.swap_musd)} in ${cn.swap_n} record${cn.swap_n === 1 ? "" : "s"} over ${swapYears} year${swapYears === 1 ? "" : "s"}` : "has no record"}`,
            framework ? `The dashed outline is a US framework event of ${framework.date.slice(0, 7)} with no drawn amount; the tallest column is ${cn.swap_musd >= cn.documented_musd && cn.swap_musd >= cn.undocumented_musd ? "the swap drawdowns" : cn.documented_musd >= cn.undocumented_musd ? "the documented commitments" : "the lower-confidence amounts"}` : `The tallest column is ${cn.swap_musd >= cn.documented_musd && cn.swap_musd >= cn.undocumented_musd ? "the swap drawdowns" : cn.documented_musd >= cn.undocumented_musd ? "the documented commitments" : "the lower-confidence amounts"} at ${fmtMusd(Math.max(cn.documented_musd, cn.undocumented_musd, cn.swap_musd))}; no US framework event is on record`,
          ]} says="The Chinese columns dwarf the American one on every footing, and the swap column, emergency liquidity the index keeps out, stands beside the documented one rather than inside it; the US framework is a promise without a sum. Which column counts as influence is the reader's choice, not the chart's." note="The US figures are authorisations, not disbursements; the framework is a draft event, drawn outlined on the same footing as the Chinese swaps.">
            <MoneyColumns cn={cn} us={us} framework={framework} />
          </Exhibit>
        </div>
        <div className="space-y-4">
          <StepCard>
            <p><strong>The receipts, read end to end.</strong> The documented Chinese block is {fmtMusd(cn.documented_musd)} since {STORY_SINCE}; the swap drawdowns beside it, {fmtMusd(cn.swap_musd)} in {cn.swap_n} record{cn.swap_n === 1 ? "" : "s"} over {swapYears} year{swapYears === 1 ? "" : "s"}{swapPeak ? ` (yearly rows of a renewed line, summed as recorded; the largest ${fmtMusd(swapPeak.swap_musd)} in ${swapPeak.year})` : ""}, are emergency liquidity the index keeps out; the dotted block is {fmtMusd(cn.undocumented_musd)} a source reported at lower confidence. The US column is {fmtMusd(us.documented_musd)}.</p>
          </StepCard>
          {lithium && lithium.CN !== null && (
            <StepCard>
              <p><strong>Lithium.</strong> {fmtMusd(lithium.CN)} of {fmtMusd(lithium.total)} of Argentina&apos;s lithium exports went to China in {lithium.year} ({fmtShare(lithium.share_cn)}); {lithium.US === null ? "no partner row for the United States (absent, not zero)" : `${fmtMusd(lithium.US)} to the United States`}.</p>
            </StepCard>
          )}
          {gold && (
            <StepCard>
              <p><strong>Gold, the larger export.</strong> {fmtMusd(gold.musd)} reported to the world in {gold.year}{gold.partners_absent ? "; no partner row for China or the United States (absent, not zero)" : ""}. Argentina talks lithium and ships gold.</p>
            </StepCard>
          )}
        </div>
      </div>
      <p className="text-sm text-ink-2">Argentina&apos;s influence index year by year, with the bands the weights could erase, and its trajectory against the US index are model outputs kept in the <Link href="/story/appendix#c8-index" className="underline decoration-dotted">appendix</Link>.</p>
      {voices.length > 0 && (
        <Exhibit id="c8-voices" title="More of the words around the sentence" layer="facts" sources={["manual_statements"]} ids={voices.map((v) => `statement:${v.id}`)} asks="What else was said around the sentence quoted at the top, by whom and when? A few more records, each with its verification, keep one quote from standing for the whole." how="One card per statement: the quote in its original language, then the speaker, role, date, source and how far the record was verified." findings={[
          `${voices.length} statement${voices.length === 1 ? "" : "s"} on the cards from ${new Set(voices.map((v) => v.speaker.name)).size === 1 ? "one speaker" : `${new Set(voices.map((v) => v.speaker.name)).size} speakers`}`,
          `${voices.filter((v) => v.source.verification === "primary_verified").length} of the ${voices.length} ${voices.filter((v) => v.source.verification === "primary_verified").length === 1 ? "rests" : "rest"} on a verified primary source${voices.filter((v) => v.source.verification === "unverified").length > 0 ? `, ${voices.filter((v) => v.source.verification === "unverified").length} unverified` : ""}`,
          quote ? `The year of the sentence at the top, ${quote.year}, holds ${voices.filter((v) => v.year === quote.year).length > 0 ? voices.filter((v) => v.year === quote.year).length : "none"} of the ${voices.length} statements` : `The cards span ${new Set(voices.map((v) => v.year)).size} reported year${new Set(voices.map((v) => v.year)).size === 1 ? "" : "s"}`,
        ]} says="Set each beside the sentence at the top and the receipts under it: these are the words the record holds around it, nothing more, and the verification field says how far each was checked.">
          <ul className="grid gap-3 md:grid-cols-3">
            {voices.map((v) => (
              <li key={v.id} className="card p-3 text-sm">
                <p className="serif leading-snug" lang={v.language}>“{(v.quote_original ?? v.quote_en ?? v.summary_en).slice(0, 200)}{(v.quote_original ?? v.quote_en ?? v.summary_en).length > 200 ? "…" : ""}”</p>
                <p className="mt-2 text-[11px] text-ink-3">{v.speaker.name}, {v.speaker.role} · {v.date} · {v.source.name} · {v.source.verification.replace(/_/g, " ")} · <span className="font-mono">{v.id}</span></p>
              </li>
            ))}
          </ul>
        </Exhibit>
      )}
      {parity && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <KeyNumber value={`${fmtMusd(parity.musd)} · ${Math.round(parity.multiple_of_us)}×`} label={`would have to switch each year for equal shares in ${parity.year}, ${Math.round(parity.multiple_of_us)} times what the United States bought${parity.reachable_with_top_mineral ? `; ${parity.top_mineral} alone could cover it` : ""} (arithmetic at constant totals)`} size="text-3xl" />
          <Link href="/country/ARG" className="btn btn-md btn-primary">Open Argentina&apos;s case file</Link>
        </div>
      )}
    </div>
  );
}
