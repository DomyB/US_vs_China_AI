"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT_WORD, IN_SCOPE, YEAR_MAX } from "@/lib/constants";
import { financeByYear, investmentByYear, leanByYear, tradeByYear, votesByYear } from "@/lib/overview";
import { verdicts as measureVerdicts } from "@/lib/verdicts";
import { Ch0Situation } from "./Ch0Situation";
import { Ch10Winning } from "./Ch10Winning";
import { Cover } from "./Cover";
import { fmtMusd, fmtPct } from "@/lib/format";
import { absentPartnerMinerals, chapterEvidence, evidenceInputs, financeLedger, loanThenFlat, mineralBoard, presentChapters, regionalTrade, seriesFromFlows, swapsByYear, tradeReceipt, undocumentedByCountry } from "@/lib/story";
import { loadStoryFiles, type StoryLoaded } from "@/lib/storyData";
import type { FlowsFile, RegionStatements, StatementRecord, StoryFile } from "@/lib/types";
import { Ch1Ledger } from "./Ch1Ledger";
import { Ch2Trade } from "./Ch2Trade";
import { Ch3Iceberg } from "./Ch3Iceberg";
import { Ch4Loans } from "./Ch4Loans";
import { Ch5SaidPaid } from "./Ch5SaidPaid";
import { Ch6Chile } from "./Ch6Chile";
import { Ch7Parity } from "./Ch7Parity";
import { Ch8Argentina } from "./Ch8Argentina";
import { Ch9Limits } from "./Ch9Limits";
import { Chapter } from "./Chapter";
import { ColdOpen, type Receipt } from "./ColdOpen";
import { ProgressRail } from "./ProgressRail";

/** The exhibits that moved to /story/appendix, by anchor: a link into the story that still carries one of these is sent on, so it keeps working. */
const APPENDIX_HASHES = new Set(["#c0-routes", "#c3-lenders", "#c6-parity", "#c7-parity", "#c8-index", "#c8-trajectory", "#c9-wall", "#c9-meters"]);

const OPENING_ID = "PS-0283";
const US_VOICES = ["PS-0101", "PS-0354", "PS-0363"];
const ARG_VOICES = ["PS-0298", "PS-0338", "PS-0240"];
const SAID_PAID = ["PS-0118", "PS-0120", "PS-0389", "PS-0290", "PS-0125", "PS-0347"];
/** Chapter 5 pairs a country's own voices with its receipts: domestic executives and the heads of state companies, never a US or Chinese official. */
const SAID_PAID_BLOCS = ["LatAm executive", "LatAm state company"];
/** Chilean records only; Ch6 filters by country as well, so a record from another country is never drawn on Chile's axis. */
const CHILE_QUOTES = ["PS-0125", "PS-0347"];

/** The years in the note are the records' own last years (flows.meta.last_year), never typed. */
const pairingNote = (ly: FlowsFile["meta"]["last_year"]) => `Records from different years, set beside a sentence as coinciding, not as its effect. The Chinese finance record ends in ${ly.finance_CN ?? "–"}; the US record runs to ${ly.finance_US ?? "–"}. Swap frameworks on both sides are shown apart from commitments.`;

function pick(story: StoryFile | null, statements: RegionStatements | null, ids: string[]): StatementRecord[] {
  const pool = new Map<string, StatementRecord>();
  for (const r of statements?.records ?? []) pool.set(r.id, r);
  for (const [id, r] of Object.entries(story?.quotes ?? {})) pool.set(id, r);
  return ids.map((id) => pool.get(id)).filter(Boolean) as StatementRecord[];
}

/**
 * The story page: the cover, the cold open, ten chapters (0, the whole picture, to 9, the limits) and the conclusion, with
 * the rail. Every number is computed from the exported files in lib/story.ts; the technical exhibits are on /story/appendix.
 */
export function StoryPage() {
  const [d, setD] = useState<StoryLoaded | null>(null);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    loadStoryFiles()
      .then((loaded) => {
        if (alive) setD(loaded);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const hash = window.location.hash;
    if (APPENDIX_HASHES.has(hash)) router.replace(`/story/appendix${hash}`);
  }, [router]);
  const computed = useMemo(() => {
    if (!d || !d.insights || !d.flows) return null;
    const { insights, flows } = d;
    const years = regionalTrade(flows);
    const ledger = financeLedger(flows);
    const ledgerAll = financeLedger(flows, { since: null });
    const arg = insights.countries.find((c) => c.iso3 === "ARG");
    const chl = insights.countries.find((c) => c.iso3 === "CHL");
    const argLedger = financeLedger(flows, { iso3: "ARG" });
    const argAll = tradeReceipt(flows, "ARG", "all");
    const argLithium = tradeReceipt(flows, "ARG", "lithium");
    const swaps = swapsByYear(flows, "ARG");
    const swapTotal = swaps.reduce((s, y) => s + y.musd, 0);
    const framework = d.quant?.events?.list?.find((e) => e.id === "us_arg_swap_line_2025") ?? null;
    const usWindows = arg?.finance;
    const ly = flows.meta.last_year;
    const receipts: Receipt[] = [];
    if (argAll) {
      // The total is every reported mineral; a mineral with no partner row (Argentina's gold) is inside it, so the receipt says so rather than reading its cells as zero.
      const absent = absentPartnerMinerals(arg?.trade);
      const caveat = absent && absent.year === argAll.year && absent.musd > 0 ? `; ${fmtMusd(absent.musd)} of that total, ${absent.minerals.join(" and ")}, has no partner row: absent, not zero` : "";
      const usReceipt = { label: "Mineral exports to the United States", window: `${argAll.year}, latest reported year`, source: "UN Comtrade · official", href: "/country/ARG?tab=actions" };
      if (argAll.share_us !== null) receipts.push({ ...usReceipt, value: `${fmtPct(argAll.share_us, 1)} (${fmtMusd(argAll.US)} of ${fmtMusd(argAll.total)})${caveat}` });
      else receipts.push({ ...usReceipt, value: `no United States partner row (absent, not zero) in ${fmtMusd(argAll.total)} reported${caveat}`, outlined: true });
    }
    if (argLithium && argLithium.CN !== null) receipts.push({ label: "Lithium exports to China", window: String(argLithium.year), value: `${fmtMusd(argLithium.CN)} of ${fmtMusd(argLithium.total)}`, source: "UN Comtrade · official", href: `/explore?view=trade&mineral=lithium&year=${argLithium.year}` });
    if (usWindows) {
      receipts.push({ label: "Documented US commitments (DFC and EXIM authorisations)", window: `${usWindows.windows.US_after[0]}–${usWindows.windows.US_after[1]}`, value: usWindows.us_2022_24 > 0 ? fmtMusd(usWindows.us_2022_24) : `none on record (${fmtMusd(usWindows.us_2015_21)} in ${usWindows.windows.CN[0]}–${usWindows.windows.CN[1]})`, source: "DFC projects, EXIM authorisations · official", outlined: usWindows.us_2022_24 === 0, href: "/country/ARG?tab=actions" });
      // The US record runs past the insights window: the years after it are printed from the same finance rows, so "none on record" never reads as none since the window.
      const from = usWindows.windows.US_after[1] + 1;
      if (ly.finance_US !== null && ly.finance_US >= from) {
        const after = financeLedger(flows, { iso3: "ARG", since: from }).US;
        const span = after.first_year === after.last_year ? String(after.first_year) : `${after.first_year}–${after.last_year}`;
        receipts.push({ label: "Documented US commitments after that window", window: `${from}–${ly.finance_US}, to where the record ends`, value: after.events > 0 ? `${fmtMusd(after.documented_musd)} in ${span} (${after.events} record${after.events === 1 ? "" : "s"})` : "none on record", source: "DFC projects, EXIM authorisations · official", outlined: after.events === 0, href: "/country/ARG?tab=actions" });
      }
    }
    if (framework) receipts.push({ label: framework.title, window: `${framework.date.slice(0, 7)} · ${framework.status} event, outside the DFC/EXIM record`, value: "no drawn amount recorded; shown apart, like the PBoC swaps", source: "pipeline/config/events.yaml", outlined: true });
    // One AidData row per year; the total is the sum of those yearly rows, so the largest single year is printed beside it (and, in chapter 3, beside the region-wide peak).
    const argPeak = swaps.length ? swaps.reduce((a, b) => (b.musd > a.musd ? b : a)) : null;
    if (argPeak) {
      receipts.push({ label: "Chinese central-bank swap drawdowns, yearly rows summed", window: `${swaps[0].year}–${swaps[swaps.length - 1].year}, where the record ends`, value: `${fmtMusd(swapTotal)} over ${swaps.length} yearly rows (largest ${fmtMusd(argPeak.musd)} in ${argPeak.year})`, source: "AidData GCDF 3.0 · independent/academic · flagged rescue lending", href: "/country/ARG?tab=analysis" });
    }
    // The US rows after the insights' later window (the DFC years), from the same finance rows, so chapter 1 can say what lies outside both windows.
    const usAfterFrom = insights.region.talk_vs_money.finance.US_after.years[1] + 1;
    const usAfterLedger = ly.finance_US !== null && ly.finance_US >= usAfterFrom ? financeLedger(flows, { since: usAfterFrom }).US : null;
    const usAfterWindow = usAfterLedger ? { musd: usAfterLedger.documented_musd, events: usAfterLedger.events, from: usAfterFrom, to: ly.finance_US as number } : null;
    const finance = insights.region.regressions.rows.find((r) => r.spec === "exports_to_cn" && r.term === "finance_flow_lag1" && (r as { variant?: string }).variant !== "ols");
    // The story export carries Chile's per-mineral series; without it the same shares are computed from flows.json's rows.
    const chlLithium = d.story?.series?.CHL?.lithium ?? seriesFromFlows(flows, "CHL", "lithium");
    const chlCopper = d.story?.series?.CHL?.copper ?? seriesFromFlows(flows, "CHL", "copper");
    const chlFlag = chl?.flags.items.find((f) => f.id.includes("large_commitment") && f.id.includes("2018"))?.id ?? null;
    const gold = arg?.contrasts.find((c) => c.id === "price_exposure") as { mineral: string; exports_musd: { US: number | null; CN: number | null; ROW: number | null }; total_musd: number; year: number } | undefined;
    const loans = loanThenFlat(insights);
    // rule hits the export itself lists apart (flags.share_absent, once it carries them), named in chapter 4 beside the ones it finds in flows.json
    const setAside = insights.countries.flatMap((c) => (c.flags.share_absent?.items ?? []).filter((f) => f.id.includes("finance_without_trade_response")).map((f) => ({ id: f.id, name: c.name, year: f.year })));
    const targets = d.quant?.forecast?.targets;
    const t = targets?.["export_share:CN"];
    const briefs = d.meta?.interpretation_briefs;
    const events = d.quant?.events;
    // The latest statement year against the last year of each record (flows.meta.last_year): trade and Chinese finance end earlier, US authorisations may reach it.
    const stm = d.statements;
    const stmYear = stm?.by_year_bloc?.length ? Math.max(...stm.by_year_bloc.map((r) => r.year)) : null;
    const stmLatest = stm && stmYear !== null ? stm.by_year_bloc.filter((r) => r.year === stmYear).reduce((s, r) => s + r.n, 0) : null;
    const onCountry = stm ? Object.values(stm.countries ?? {}).reduce((s, n) => s + n, 0) : 0;
    const reaches = (y: number | null) => y !== null && stmYear !== null && y >= stmYear;
    const records = [
      { label: "reported trade", last: ly.trade },
      { label: "the Chinese finance record", last: ly.finance_CN },
      { label: "the US finance record", last: ly.finance_US },
    ];
    const behind = records.filter((r) => !reaches(r.last)).map((r) => `${r.label} ends in ${r.last ?? "–"}`);
    const ahead = records.filter((r) => reaches(r.last)).map((r) => r.label);
    const usLatest = reaches(ly.finance_US) ? ledgerAll.US.by_year.find((y) => y.year === stmYear) : undefined;
    const aheadClause = ahead.length ? `only ${ahead.join(" and ")} ${ahead.length === 1 ? "reaches" : "reach"} that year${usLatest ? ` (${fmtMusd(usLatest.documented_musd)} of US authorisations in ${stmYear})` : ""}` : "no reported trade or finance reaches that year";
    const stm2026 = stmLatest;
    const headlines = d.meta ? Object.values(d.meta.coverage).reduce((s, c) => s + (c.media_articles ?? 0), 0) : null;
    const limits = [
      stm && stmLatest !== null ? { text: `${stmLatest} of the ${stm.n_in_scope} in-scope statements (${onCountry} on a country, ${stm.n_in_scope - onCountry} region-wide) are from ${stmYear}; ${[behind.join(", "), aheadClause].filter(Boolean).join("; ")}.`, ids: [`statement:count:${stmYear}`, "flows:meta.last_year"] } : null,
      { text: `The Chinese finance record ends in ${flows.meta.last_year.finance_CN ?? "–"} (AidData GCDF 3.0); the US record runs to ${flows.meta.last_year.finance_US ?? "–"} and is authorisations, not disbursements. The years in between are blank, never zero.`, ids: ["flows:meta.last_year"] },
      { text: `Stance is the dataset's own coding, not validated against a human judgement; the legislative stance series is a zero-shot baseline. ${briefs ? `${briefs.reviewed} of ${briefs.total} written briefs are reviewed by the owner.` : ""}`, ids: ["meta:text_model", "meta:interpretation_briefs"] },
      events ? { text: `${events.draft} of the ${events.total} dated events are still draft (${events.rows} windows, ${events.with_window} with both sides, ${events.did_rows} difference-in-differences); read a direction, not an effect.`, ids: ["quant:events"] } : null,
      t && t.coverage_80 !== undefined ? { text: `The share-to-China forecast band ${t.coverage_80 < 0.8 ? "under-covers" : "covers as nominal"}: the ${t.model} model's 80% band held ${Math.round(t.coverage_80 * 100)}% of ${t.n_tests ?? "–"} backtests.`, ids: ["forecast:targets:export_share:CN"] } : null,
      headlines !== null ? { text: `${headlines} press headlines in total across the ${COUNTRY_COUNT_WORD} countries; too few to analyse, shown as a record only.`, ids: ["meta:coverage.media_articles"] } : null,
      { text: "Four scales (coded stance −1..+1, zero-shot stance −2..+2, tone, index 0–100) are never added together; a comparison between them is a direction only.", ids: ["insights:region.scales"] },
    ].filter(Boolean) as { text: string; ids: string[] }[];
    // The chapter meters: editorial levels, but every year or count in a basis is the export's, dropped when its input is absent.
    const chapters = chapterEvidence(evidenceInputs(flows, insights, d.quant));
    return { years, ledger, ledgerAll, arg, chl, argLedger, argLithium, gold, receipts, finance, chlLithium, chlCopper, chlFlag, loans, setAside, targets, framework, limits, stm2026, chapters, argPeak, usAfterWindow, pairingNote: pairingNote(ly) };
  }, [d]);

  if (!d && !failed) return <InsightsSkeleton />;
  if (failed || !d || !d.insights || !d.flows || !computed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-2">
        <h1 className="text-2xl">Said &amp; Paid</h1>
        {failed ? (
          <p className="mt-2">The story reads the real data export, and the export could not be loaded (a network error or a missing file). Reload the page, or go in through the evidence room: <a href="/explore" className="underline">open the map</a>.</p>
        ) : (
          <p className="mt-2">The story reads the real data export. No export has landed yet, so the evidence room and the case files are the way in: <a href="/explore" className="underline">open the map</a>.</p>
        )}
      </div>
    );
  }
  const { insights, flows } = d;
  const c = computed;
  const scope = new Set(IN_SCOPE);
  const overview = {
    trade: tradeByYear(flows.trade, scope),
    finance: financeByYear(flows.finance, scope),
    votes: d.components ? votesByYear(d.components, scope) : [],
    lean: leanByYear(d.index.rows, scope),
    investment: d.investment ? investmentByYear(d.investment, scope) : [],
  };
  const verdictRows = measureVerdicts(overview, { trade: flows.meta.last_year.trade ?? null, finance_CN: flows.meta.last_year.finance_CN ?? null }, YEAR_MAX);
  const countriesWithFacts = d.meta ? Object.values(d.meta.coverage ?? {}).filter((cv) => (cv as { trade_years?: unknown[] }).trade_years?.length).length : null;
  const sourcesLine = d.meta?.sources_live ? `${d.meta.sources_live.live} of ${d.meta.sources_live.total} registered sources answered the last liveness check; ${d.meta.sources_ok?.length ?? 0} adapters ran in the last ingestion.` : null;
  // Two counts, never confused (DECISIONS 73): registry sources that answered the liveness check, and adapters that ran in the last ingestion.
  const release = d.meta
    ? `Data as of ${d.meta.generated_on} · ${d.meta.quant_model?.inputs_release ?? ""} · ${d.meta.sources_live ? `${d.meta.sources_live.live} of ${d.meta.sources_live.total} sources live` : `${d.meta.sources_ok.length} adapters ran`}${d.meta.adapters_ok ? ` · ${d.meta.adapters_ok.ok} of ${d.meta.adapters_ok.total} adapters ran` : ""}`
    : "";
  const meter = (n: number) => c.chapters.find((ch) => ch.n === n);
  // Chapters 6 and 8 render only with their country's insights; the rail and the appendix's meters name the chapters on the page, never a dead anchor.
  const present = presentChapters(c.chapters, { chl: c.chl !== undefined, arg: c.arg !== undefined });
  const opening = pick(d.story, d.statements, [OPENING_ID])[0] ?? null;
  const storyMissing = d.story === null;
  const absence = storyMissing ? "The opening sentence is not in this release: the story export (story.json) has not been written. The receipts below are on record." : `The opening sentence (${OPENING_ID}) is not in this release's story export; the receipts below are on record.`;
  return (
    <div>
      <ProgressRail items={present} />
      <Cover release={release} sourcesLine={sourcesLine} />
      <Chapter n={0} eyebrow="The whole picture" question={`Across ${COUNTRY_COUNT_WORD} countries, who buys the ore, who writes the cheques, and who gets the votes?`} meter={present[0]}>
        <Ch0Situation trade={overview.trade} finance={overview.finance} votes={overview.votes} lean={overview.lean} investment={overview.investment} lastYear={{ trade: flows.meta.last_year.trade ?? null, finance_CN: flows.meta.last_year.finance_CN ?? null, finance_US: flows.meta.last_year.finance_US ?? null }} countriesWithFacts={countriesWithFacts} />
      </Chapter>
      <ColdOpen quote={opening} absence={absence} receipts={c.receipts} release={release} pairingNote={c.pairingNote} />
      <Chapter n={1} eyebrow="The ledger" question="Who is louder, and who writes the cheques?" meter={meter(1)}>
        <Ch1Ledger region={insights.region} lastYear={{ finance_US: flows.meta.last_year.finance_US, finance_CN: flows.meta.last_year.finance_CN }} afterWindow={c.usAfterWindow} voices={pick(d.story, d.statements, US_VOICES)} />
      </Chapter>
      <Chapter n={2} eyebrow="The trade" question="While they talked, where did the ore go?" meter={meter(2)}>
        <Ch2Trade years={c.years} board={mineralBoard(d.shares)} prices={insights.region.prices} coverage={d.meta?.coverage ?? null} />
      </Chapter>
      <Chapter n={3} eyebrow="The money nobody counts" question={`Is ${fmtMusd(c.ledger.CN.documented_musd)} the whole of Beijing's money?`} meter={meter(3)}>
        <Ch3Iceberg cn={c.ledger.CN} us={c.ledger.US} allYearsCN={c.ledgerAll.CN} undocumentedTop={undocumentedByCountry(flows)} network={d.quant?.network ?? null} lastYearCN={flows.meta.last_year.finance_CN} argPeak={c.argPeak} />
      </Chapter>
      <Chapter n={4} eyebrow="Money that did not move the minerals" question="When a large commitment arrived, did the lender's share of the minerals move?" meter={meter(4)}>
        <Ch4Loans loans={c.loans} setAside={c.setAside} finance={c.finance} chile={c.chlLithium.length ? { series: c.chlLithium, year: 2018, flag: c.chlFlag } : null} />
      </Chapter>
      <Chapter n={5} eyebrow="Said vs paid" question="Country by country, what did the executives say, and what share of the ore went there?" meter={meter(5)}>
        <Ch5SaidPaid countries={insights.countries} byBloc={insights.region.talk_vs_money.by_bloc} hedgers={insights.region.hedgers} quotes={pick(d.story, d.statements, SAID_PAID).filter((q) => SAID_PAID_BLOCS.includes(q.speaker.bloc))} storyMissing={storyMissing} />
      </Chapter>
      {c.chl && (
        <Chapter n={6} eyebrow="The hinge" question="Read end to end, when did money, words and ore move in Chile, and in what order?" meter={meter(6)}>
          <Ch6Chile chile={c.chl} lithium={c.chlLithium} copper={c.chlCopper} lastYearCN={flows.meta.last_year.finance_CN} quotes={pick(d.story, d.statements, CHILE_QUOTES).filter((q) => q.country === "CHL")} />
        </Chapter>
      )}
      <Chapter n={7} eyebrow="What it would take" question="If Washington meant it, what would have to change hands, and what does 2030 look like?" meter={meter(7)}>
        <Ch7Parity countries={insights.countries} targets={c.targets} scenarios={insights.region.scenarios} />
      </Chapter>
      {c.arg && (
        <Chapter n={8} eyebrow="Back to the sentence" question="So what was happening while the Foreign Minister spoke?" meter={meter(8)}>
          <Ch8Argentina arg={c.arg} quote={opening} receipts={c.receipts} pairingNote={c.pairingNote} cn={c.argLedger.CN} us={c.argLedger.US} framework={c.framework ? { id: c.framework.id, date: c.framework.date, title: c.framework.title, status: c.framework.status, type: c.framework.type } : null} lithium={c.argLithium} gold={c.gold ? { musd: c.gold.total_musd, year: c.gold.year, partners_absent: c.gold.exports_musd.US === null || c.gold.exports_musd.CN === null } : null} voices={pick(d.story, d.statements, ARG_VOICES)} />
        </Chapter>
      )}
      <Chapter n={9} eyebrow="The limits, as the last exhibit" question="How strong is each chapter, and what would change the reading?" meter={meter(9)}>
        <Ch9Limits limits={c.limits} changes={["A second coder and a validated text model (the 300-document sample is drawn and waits for the owner).", `DFC and EXIM commitments after ${insights.region.talk_vs_money.finance.US_after.years[1]} approaching the Chinese figures.`, ...(flows.meta.last_year.trade !== null ? [`A ${flows.meta.last_year.trade + 1} trade year in which Chile's US share rises more than two points.`] : []), `AidData's next release, covering Chinese finance after ${flows.meta.last_year.finance_CN ?? "its last year"}.`, "The AEI investment tracker and BU's CODF files, supplied by hand.", "The owner's review of the dated events and the thirteen written briefs."]} />
      </Chapter>
      <Chapter n={10} eyebrow="The conclusion" question="So who is winning, by which measure, and what comes next?" meter={present[present.length - 1]}>
        <Ch10Winning verdicts={verdictRows} />
      </Chapter>
      <p className="sr-only">{IN_SCOPE.length} countries in scope.</p>
    </div>
  );
}
