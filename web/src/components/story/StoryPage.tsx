"use client";

import { useEffect, useMemo, useState } from "react";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { IN_SCOPE } from "@/lib/constants";
import { loadFlows, loadIndex, loadInsights, loadQuant, loadRealMeta, loadRegionShares, loadRegionStatements, loadStory } from "@/lib/data";
import { fmtMusd, fmtPct } from "@/lib/format";
import { coverageWall, financeLedger, loanThenFlat, mineralBoard, regionalTrade, swapsByYear, tradeReceipt, undocumentedByCountry } from "@/lib/story";
import type { EvidenceLevel, FlowsFile, IndexFile, InsightsFile, QuantFile, RealMeta, RegionData, RegionStatements, StatementRecord, StoryFile } from "@/lib/types";
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

interface Loaded {
  insights: InsightsFile | null;
  flows: FlowsFile | null;
  shares: RegionData["mineral_shares"];
  quant: QuantFile | null;
  index: IndexFile;
  meta: RealMeta | null;
  story: StoryFile | null;
  statements: RegionStatements | null;
}

const OPENING_ID = "PS-0283";
const US_VOICES = ["PS-0101", "PS-0354", "PS-0363"];
const ARG_VOICES = ["PS-0298", "PS-0338", "PS-0240"];
const SAID_PAID = ["PS-0118", "PS-0120", "PS-0389", "PS-0290", "PS-0125", "PS-0347"];
/** Chapter 5 pairs a country's own voices with its receipts: domestic executives and the heads of state companies, never a US or Chinese official. */
const SAID_PAID_BLOCS = ["LatAm executive", "LatAm state company"];
/** Chilean records only; Ch6 filters by country as well, so a record from another country is never drawn on Chile's axis. */
const CHILE_QUOTES = ["PS-0125", "PS-0347"];

const PAIRING_NOTE = "Records from different years, set beside a sentence as coinciding, not as its effect. The Chinese finance record ends in 2021; the US record runs to 2026. Swap frameworks on both sides are shown apart from commitments.";

function pick(story: StoryFile | null, statements: RegionStatements | null, ids: string[]): StatementRecord[] {
  const pool = new Map<string, StatementRecord>();
  for (const r of statements?.records ?? []) pool.set(r.id, r);
  for (const [id, r] of Object.entries(story?.quotes ?? {})) pool.set(id, r);
  return ids.map((id) => pool.get(id)).filter(Boolean) as StatementRecord[];
}

/** The home page: the cold open, nine chapters, the rail. Every number is computed from the exported files in lib/story.ts. */
export function StoryPage() {
  const [d, setD] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([loadInsights(), loadFlows(), loadRegionShares(), loadQuant(), loadIndex(), loadRealMeta(), loadStory(), loadRegionStatements()])
      .then(([insights, flows, shares, quant, index, meta, story, statements]) => {
        if (alive) setD({ insights, flows: flows.layer === "real" ? flows.data : null, shares: shares.layer === "real" ? shares.rows : [], quant, index, meta, story, statements });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
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
    const receipts: Receipt[] = [];
    if (argAll && argAll.share_us !== null) receipts.push({ label: "Mineral exports to the United States", window: `${argAll.year}, latest reported year`, value: `${fmtPct(argAll.share_us, 1)} (${fmtMusd(argAll.US)} of ${fmtMusd(argAll.total)})`, source: "UN Comtrade · official", href: "/country/ARG?tab=actions" });
    if (argLithium && argLithium.CN !== null) receipts.push({ label: "Lithium exports to China", window: String(argLithium.year), value: `${fmtMusd(argLithium.CN)} of ${fmtMusd(argLithium.total)}`, source: "UN Comtrade · official", href: "/explore?view=trade&mineral=lithium&year=2025" });
    if (usWindows) receipts.push({ label: "Documented US commitments (DFC and EXIM authorisations)", window: `${usWindows.windows.US_after[0]}–${usWindows.windows.US_after[1]}`, value: usWindows.us_2022_24 > 0 ? fmtMusd(usWindows.us_2022_24) : `none on record (${fmtMusd(usWindows.us_2015_21)} in ${usWindows.windows.CN[0]}–${usWindows.windows.CN[1]})`, source: "DFC projects, EXIM authorisations · official", outlined: usWindows.us_2022_24 === 0, href: "/country/ARG?tab=actions" });
    if (framework) receipts.push({ label: framework.title, window: `${framework.date.slice(0, 7)} · ${framework.status} event, outside the DFC/EXIM record`, value: "no drawn amount recorded; shown apart, like the PBoC swaps", source: "pipeline/config/events.yaml", outlined: true });
    if (swaps.length) {
      // One AidData row per year; the total is the sum of those yearly rows, so the largest single year is printed beside it.
      const peak = swaps.reduce((a, b) => (b.musd > a.musd ? b : a));
      receipts.push({ label: "Chinese central-bank swap drawdowns, yearly rows summed", window: `${swaps[0].year}–${swaps[swaps.length - 1].year}, where the record ends`, value: `${fmtMusd(swapTotal)} over ${swaps.length} yearly rows (largest ${fmtMusd(peak.musd)} in ${peak.year})`, source: "AidData GCDF 3.0 · independent/academic · flagged rescue lending", href: "/country/ARG?tab=analysis" });
    }
    const finance = insights.region.regressions.rows.find((r) => r.spec === "exports_to_cn" && r.term === "finance_flow_lag1" && (r as { variant?: string }).variant !== "ols");
    const chlLithium = d.story?.series?.CHL?.lithium ?? [];
    const chlCopper = d.story?.series?.CHL?.copper ?? [];
    const chlFlag = chl?.flags.items.find((f) => f.id.includes("large_commitment") && f.id.includes("2018"))?.id ?? null;
    // The influence index is drawn only from the real export; a seeded sample index is never shown as model output.
    const argRows = d.index.layer === "real" ? d.index.rows.filter((r) => r.iso3 === "ARG" && r.mineral === "all") : [];
    const gold = arg?.contrasts.find((c) => c.id === "price_exposure") as { mineral: string; exports_musd: { US: number | null; CN: number | null; ROW: number | null }; total_musd: number; year: number } | undefined;
    const loans = loanThenFlat(insights);
    const wall = d.meta ? coverageWall(d.meta, flows) : null;
    const targets = d.quant?.forecast?.targets;
    const t = targets?.["export_share:CN"];
    const briefs = d.meta?.interpretation_briefs;
    const events = d.quant?.events;
    // The latest statement year against the last year of each record (flows.meta.last_year): trade and Chinese finance end earlier, US authorisations may reach it.
    const stm = d.statements;
    const stmYear = stm?.by_year_bloc?.length ? Math.max(...stm.by_year_bloc.map((r) => r.year)) : null;
    const stmLatest = stm && stmYear !== null ? stm.by_year_bloc.filter((r) => r.year === stmYear).reduce((s, r) => s + r.n, 0) : null;
    const onCountry = stm ? Object.values(stm.countries ?? {}).reduce((s, n) => s + n, 0) : 0;
    const ly = flows.meta.last_year;
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
      headlines !== null ? { text: `${headlines} press headlines in total across the twelve countries; too few to analyse, shown as a record only.`, ids: ["meta:coverage.media_articles"] } : null,
      { text: "Four scales (coded stance −1..+1, zero-shot stance −2..+2, tone, index 0–100) are never added together; a comparison between them is a direction only.", ids: ["insights:region.scales"] },
    ].filter(Boolean) as { text: string; ids: string[] }[];
    return { years, ledger, ledgerAll, arg, chl, argLedger, argLithium, gold, receipts, finance, chlLithium, chlCopper, chlFlag, argRows, loans, wall, targets, framework, limits, stm2026 };
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
  const release = d.meta ? `Data as of ${d.meta.generated_on} · ${d.meta.quant_model?.inputs_release ?? ""} · ${d.meta.sources_ok.length} sources live` : "";
  const chapters: { n: number; label: string; level: EvidenceLevel; basis: string }[] = [
    { n: 1, label: "Who talks, who pays", level: "moderate", basis: "AidData ends 2021; the statements favour prominent US voices" },
    { n: 2, label: "Where the ore went", level: "strong", basis: "reported trade, UN Comtrade" },
    { n: 3, label: "The money nobody counts", level: "strong", basis: "facts with confidence tiers" },
    { n: 4, label: "Did the loans buy the ore", level: "moderate", basis: "rule outputs and a panel association" },
    { n: 5, label: "Said vs paid", level: "thin", basis: "unvalidated stance coding; three statements for some countries" },
    { n: 6, label: "The hinge: Chile", level: "strong", basis: "money and trade; thin on words" },
    { n: 7, label: "What it would take, 2030", level: "moderate", basis: "parity is arithmetic; the forecast band under-covers" },
    { n: 8, label: "Back to the sentence", level: "moderate", basis: "strong on money and trade, draft events, thin words" },
    { n: 9, label: "What this cannot see", level: "strong", basis: "coverage is a fact about the record" },
  ];
  const opening = pick(d.story, d.statements, [OPENING_ID])[0] ?? null;
  return (
    <div>
      <ProgressRail items={chapters} />
      <ColdOpen quote={opening} receipts={c.receipts} release={release} pairingNote={PAIRING_NOTE} />
      <Chapter n={1} eyebrow="The ledger" question="Who is louder, and who writes the cheques?" meter={chapters[0]}>
        <Ch1Ledger region={insights.region} lastYear={{ finance_US: flows.meta.last_year.finance_US, finance_CN: flows.meta.last_year.finance_CN }} voices={pick(d.story, d.statements, US_VOICES)} />
      </Chapter>
      <Chapter n={2} eyebrow="The trade" question="While they talked, where did the ore go?" meter={chapters[1]}>
        <Ch2Trade years={c.years} board={mineralBoard(d.shares)} prices={insights.region.prices} />
      </Chapter>
      <Chapter n={3} eyebrow="The money nobody counts" question={`Is ${fmtMusd(c.ledger.CN.documented_musd)} the whole of Beijing's money?`} meter={chapters[2]}>
        <Ch3Iceberg cn={c.ledger.CN} us={c.ledger.US} allYearsCN={c.ledgerAll.CN} undocumentedTop={undocumentedByCountry(flows)} network={d.quant?.network ?? null} lastYearCN={flows.meta.last_year.finance_CN} />
      </Chapter>
      <Chapter n={4} eyebrow="Money that did not move the minerals" question="When a large commitment arrived, did the lender's share of the minerals move?" meter={chapters[3]}>
        <Ch4Loans loans={c.loans} finance={c.finance} chile={c.chlLithium.length ? { series: c.chlLithium, year: 2018, flag: c.chlFlag } : null} />
      </Chapter>
      <Chapter n={5} eyebrow="Said vs paid" question="Country by country, what did the executives say, and what share of the ore went there?" meter={chapters[4]}>
        <Ch5SaidPaid countries={insights.countries} byBloc={insights.region.talk_vs_money.by_bloc} hedgers={insights.region.hedgers} quotes={pick(d.story, d.statements, SAID_PAID).filter((q) => SAID_PAID_BLOCS.includes(q.speaker.bloc))} />
      </Chapter>
      {c.chl && (
        <Chapter n={6} eyebrow="The hinge" question="Read end to end, when did money, words and ore move in Chile, and in what order?" meter={chapters[5]}>
          <Ch6Chile chile={c.chl} lithium={c.chlLithium} copper={c.chlCopper} quotes={pick(d.story, d.statements, CHILE_QUOTES).filter((q) => q.country === "CHL")} />
        </Chapter>
      )}
      <Chapter n={7} eyebrow="What it would take" question="If Washington meant it, what would have to change hands, and what does 2030 look like?" meter={chapters[6]}>
        <Ch7Parity countries={insights.countries} targets={c.targets} scenarios={insights.region.scenarios} />
      </Chapter>
      {c.arg && (
        <Chapter n={8} eyebrow="Back to the sentence" question="So what was happening while the Foreign Minister spoke?" meter={chapters[7]}>
          <Ch8Argentina arg={c.arg} quote={opening} receipts={c.receipts} pairingNote={PAIRING_NOTE} cn={c.argLedger.CN} us={c.argLedger.US} framework={c.framework ? { id: c.framework.id, date: c.framework.date, title: c.framework.title, status: c.framework.status, type: c.framework.type } : null} rows={c.argRows} lithium={c.argLithium} gold={c.gold ? { musd: c.gold.total_musd, year: c.gold.year, partners_absent: c.gold.exports_musd.US === null || c.gold.exports_musd.CN === null } : null} voices={pick(d.story, d.statements, ARG_VOICES)} />
        </Chapter>
      )}
      {c.wall && (
        <Chapter n={9} eyebrow="The limits, as the last exhibit" question="How strong is each chapter, and what would change the reading?" meter={chapters[8]}>
          <Ch9Limits wall={c.wall} chapters={chapters} limits={c.limits} changes={["A second coder and a validated text model (the 300-document sample is drawn and waits for the owner).", "DFC and EXIM commitments after 2024 approaching the Chinese figures.", `A ${(flows.meta.last_year.trade ?? 2025) + 1} trade year in which Chile's US share rises more than two points.`, "AidData's next release, covering Chinese finance after 2021.", "The AEI investment tracker and BU's CODF files, supplied by hand.", "The owner's review of the dated events and the thirteen written briefs."]} />
        </Chapter>
      )}
      <p className="sr-only">{IN_SCOPE.length} countries in scope.</p>
    </div>
  );
}
