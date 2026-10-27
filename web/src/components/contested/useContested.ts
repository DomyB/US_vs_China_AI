"use client";

import { useEffect, useMemo, useState } from "react";
import { usePictures } from "@/components/ui/Picture";
import { IN_SCOPE } from "@/lib/constants";
import { attentionVsMoney, capitalVsOre, chinaConcentration, echoFamilies, fanWidth, hongKongChannel, leanFlips, lendingVsOre, mineralSplit, panelNull, pressureCases, pricesVsValue, talkPattern, turnSummary, turnsVsOre, votesVsOre, warmWordsNoTrade, type Turn, type Verdict } from "@/lib/contested";
import { loadComponents, loadFlows, loadIndex, loadInsights, loadInvestment, loadRegionShares, loadRoutes } from "@/lib/data";
import { indirectFor, latestRouteYear } from "@/lib/routes";
import { loadStage } from "@/lib/stage";
import type { ComponentsFile } from "@/lib/geometry";
import type { Picture } from "@/lib/pictures";
import type { IndirectLeg, RoutesFile } from "@/lib/routes";
import type { StageRecords } from "@/lib/stage";
import type { FlowsFile, IndexFile, InsightRegion, InsightsFile, InvestmentFile, MineralShareRow } from "@/lib/types";

interface Loaded { flows: FlowsFile; flowsLayer: "real" | "sample"; index: IndexFile | null; insights: InsightsFile | null; investment: InvestmentFile | null; shares: MineralShareRow[]; components: ComponentsFile | null; rec: StageRecords | null; routes: RoutesFile | null }

/** The indirect route into the United States in the latest year the routes file carries: the direct share, the ceiling and its largest leg. */
export interface RouteSummary { year: number; direct: number | null; bound: number | null; top: IndirectLeg | null; world: number | null }

/** Everything the claims print, computed once from the loaded files; a null means the release lacks that record. */
export interface ContestedData {
  /** the flows file is the seeded sample, so every verdict means nothing until the first data run */
  sample: boolean;
  pictures: Map<string, Picture> | null;
  turns: Turn[];
  ts: ReturnType<typeof turnSummary>;
  lend: ReturnType<typeof lendingVsOre>;
  peakShare: number | null;
  lastShare: number | null;
  cap: ReturnType<typeof capitalVsOre>;
  minerals: ReturnType<typeof mineralSplit> | null;
  lithium: MineralShareRow | null;
  panel: ReturnType<typeof panelNull> | null;
  votes: ReturnType<typeof votesVsOre> | null;
  talk: ReturnType<typeof talkPattern> | null;
  /** the share of Latin American executive statements that take no position on either power */
  neither: number | null;
  /** the hedging balances, most balanced first */
  hedgers: InsightRegion["hedgers"];
  att: ReturnType<typeof attentionVsMoney> | null;
  cases: ReturnType<typeof pressureCases> | null;
  conc: ReturnType<typeof chinaConcentration>;
  prices: ReturnType<typeof pricesVsValue>;
  echoes: ReturnType<typeof echoFamilies> | null;
  flips: ReturnType<typeof leanFlips> | null;
  /** the three largest exporters to China in the concentration year */
  bigThree: string[];
  bigFlips: ReturnType<typeof leanFlips>;
  /** the countries whose net lean changed sign five times or more */
  noisy: ReturnType<typeof leanFlips>;
  warm: ReturnType<typeof warmWordsNoTrade> | null;
  hk: ReturnType<typeof hongKongChannel> | null;
  fans: ReturnType<typeof fanWidth> | null;
  route: RouteSummary | null;
}

/** One verdict per claim id, computed from the record by the rules below, so a new data release can change them. */
export type ContestedVerdicts = Record<string, Verdict>;

function derive(d: Loaded, pictures: Map<string, Picture> | null): { data: ContestedData; verdicts: ContestedVerdicts } {
  const turns = d.rec ? turnsVsOre(d.rec.TERMS, d.flows.trade, IN_SCOPE) : [];
  const ts = turnSummary(turns);
  const lend = lendingVsOre(d.flows.finance, d.flows.trade, IN_SCOPE);
  const cap = d.investment ? capitalVsOre(d.investment) : null;
  const minerals = d.shares.length ? mineralSplit(d.shares) : null;
  const panel = d.insights ? panelNull(d.insights.region.regressions.rows) : null;
  const votes = d.components ? votesVsOre(d.components.components) : null;
  const talk = d.insights ? talkPattern(d.insights.region) : null;
  const att = d.insights ? attentionVsMoney(d.insights.region.attention) : null;
  const cases = d.rec ? pressureCases(d.rec.CASES) : null;
  const conc = chinaConcentration(d.flows.trade, IN_SCOPE);
  const prices = d.insights ? pricesVsValue(d.insights.region.prices, d.flows.trade, IN_SCOPE, "copper") : null;
  const echoes = d.insights ? echoFamilies(d.insights.region.event_echoes) : null;
  const flips = d.index ? leanFlips(d.index.rows) : null;
  const warm = d.insights ? warmWordsNoTrade(d.insights.countries, "US") : null;
  const hk = d.investment ? hongKongChannel(d.investment) : null;
  const fans = d.insights ? fanWidth(d.insights.countries) : null;
  const hedgers = d.insights ? d.insights.region.hedgers.slice().sort((a, b) => b.balance - a.balance) : [];
  let route: RouteSummary | null = null;
  if (d.routes) {
    const year = latestRouteYear(d.routes, "USA", "all");
    if (year != null) {
      const ind = indirectFor(d.routes, "USA", "all", year);
      route = { year, direct: ind.direct != null && ind.world ? ind.direct / ind.world : null, bound: ind.world ? ind.bound_total / ind.world : null, top: ind.legs.find((l) => l.bound != null) ?? null, world: ind.world };
    }
  }

  // verdicts are computed from the record, so a new data release can change them
  const vTurns: Verdict = ts.tested < 6 ? "open" : (ts.right.mean ?? 0) > 0 && (ts.left.mean ?? 0) > 0 ? "holds" : (ts.right.mean ?? 0) < 0 && (ts.left.mean ?? 0) > 0 ? "fails" : "part";
  const peakShare = lend.peak?.share_cn ?? null, lastShare = lend.lastCN?.share_cn ?? null;
  const vLend: Verdict = lend.peak && lend.lastCN && peakShare != null && lastShare != null ? (lend.lastCN.CN < lend.peak.CN / 2 && lastShare > peakShare ? "holds" : lend.lastCN.CN < lend.peak.CN / 2 ? "part" : "fails") : "open";
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
  // the hidden route is a bound, never a figure, so the claim cannot be settled on the record
  const vRoute: Verdict = "open";
  const vConc: Verdict = conc ? (conc.top3Share >= 0.75 ? "holds" : conc.top3Share >= 0.5 ? "part" : "fails") : "open";
  const vPrices: Verdict = prices ? ((prices.corr ?? 0) >= 0.7 ? "holds" : (prices.corr ?? 0) >= 0.4 ? "part" : "fails") : "open";
  const vEchoes: Verdict = echoes && echoes.usMeasures.length ? (echoes.usLose === echoes.usMeasures.length ? "holds" : echoes.usLose * 2 >= echoes.usMeasures.length ? "part" : "fails") : "open";
  // the three largest exporters to China in the latest year, and whether their lean ever changed sign
  const bigThree = conc?.top3.map((r) => r.iso3) ?? [];
  const bigFlips = flips?.filter((f) => bigThree.includes(f.iso3)) ?? [];
  const noisy = flips?.filter((f) => f.flips >= 5) ?? [];
  const vFlips: Verdict = flips && flips.length && bigFlips.length === 3 ? (bigFlips.every((f) => f.flips === 0) && noisy.length >= 3 ? "holds" : bigFlips.every((f) => f.flips <= 1) ? "part" : "fails") : "open";
  const vWarm: Verdict = warm && warm.rows.length ? (warm.warmNoTrade.length >= 2 ? "holds" : warm.warmNoTrade.length === 1 ? "part" : "fails") : "open";
  // the claim is that Hong Kong hides the stake, and the record is expected to fail it: it holds only if the Hong Kong
  // channel is larger in most reporting countries and in total, and there is no "in part" between holding and failing
  const vHK: Verdict = hk && hk.rows.length ? (hk.hkLarger.length * 2 > hk.rows.length && hk.hkTotal > hk.cnTotal ? "holds" : "fails") : "open";
  // the claim is that the forecast says where this goes: it holds only if most fans are narrower than the history
  const vFans: Verdict = fans && fans.rows.length ? (fans.wider.length * 2 > fans.rows.length ? "fails" : fans.wider.length * 4 > fans.rows.length ? "part" : "holds") : "open";

  return {
    data: { sample: d.flowsLayer === "sample", pictures, turns, ts, lend, peakShare, lastShare, cap, minerals, lithium, panel, votes, talk, neither, hedgers, att, cases, conc, prices, echoes, flips, bigThree, bigFlips, noisy, warm, hk, fans, route },
    verdicts: { turns: vTurns, lending: vLend, capital: vCap, minerals: vMin, prices: vPrices, three: vConc, attention: vAtt, panel: vPanel, votes: vVotes, talk: vTalk, hedge: vHedge, pressure: vCases, route: vRoute, echoes: vEchoes, flips: vFlips, warm: vWarm, hongkong: vHK, fans: vFans },
  };
}

/**
 * The record behind the claims against the grain, loaded once and shared by the arguments page and the page of further
 * claims: the data files, the derived tables and one verdict per claim. `loading` while the files arrive, `error` when
 * they cannot be loaded; `data` and `verdicts` are null until then.
 */
export function useContested(): { loading: boolean; error: boolean; data: ContestedData | null; verdicts: ContestedVerdicts | null } {
  const [d, setD] = useState<Loaded | null | undefined>(undefined);
  useEffect(() => {
    Promise.all([loadFlows(), loadInsights(), loadInvestment(), loadRegionShares(), loadComponents(), loadStage(), loadRoutes(), loadIndex().catch(() => null)])
      .then(([f, ins, inv, sh, comp, stage, routes, index]) => setD({ flows: f.data, flowsLayer: f.layer, index, insights: ins, investment: inv, shares: sh.rows, components: comp, rec: stage?.rec ?? null, routes }))
      .catch(() => setD(null));
  }, []);
  const pictures = usePictures();
  const derived = useMemo(() => (d ? derive(d, pictures) : null), [d, pictures]);
  return { loading: d === undefined, error: d === null, data: derived?.data ?? null, verdicts: derived?.verdicts ?? null };
}
