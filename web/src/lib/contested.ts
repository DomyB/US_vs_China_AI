/**
 * "Against the grain": claims that cut across the usual story of the rivalry, each tested on this site's own record.
 * Every number here is computed from the loaded files; the wording of the claim and the verdict is interpretation and
 * says so on the page. Nothing is estimated: where a test cannot be run on the record, the function says why.
 */
import type { StageRecords } from "@/lib/stage";
import type { ComponentRow } from "@/lib/geometry";
import type { AttentionYear, FlowFinanceRow, FlowTradeRow, InsightRegion, InsightRegression, InvestmentFile, MineralShareRow } from "@/lib/types";

export type Verdict = "holds" | "part" | "fails" | "open";

/** The eleven claims, as the home and the story list them; the arguments page computes each one's verdict from the record. */
export const CLAIMS: { id: string; headline: string; stake: string }[] = [
  { id: "turns", headline: "Elections did not change the buyer", stake: "A friendlier government is not a lever on the ore." },
  { id: "lending", headline: "The money left; the ore kept coming", stake: "Cutting the loans would not cut the trade." },
  { id: "capital", headline: "China buys the ore; the capital in the ground is American", stake: "Each power is strong where the other is absent." },
  { id: "minerals", headline: "They are not buying the same minerals", stake: "The region's leverage is mineral by mineral." },
  { id: "panel", headline: "Nothing either power does shows up in the ore", stake: "The programmes need another justification." },
  { id: "votes", headline: "Votes do not follow the ore", stake: "A UN vote is weak evidence of a mineral tie." },
  { id: "talk", headline: "Washington talks about China; Beijing paid", stake: "Words on one side, money on the other." },
  { id: "hedge", headline: "Most of the region's leaders mention neither power", stake: "The choice of sides is a framing from outside." },
  { id: "attention", headline: "Washington's attention arrived after Beijing's money had left", stake: "Policy aimed at a past position." },
  { id: "pressure", headline: "Pressure removes options and builds nothing", stake: "The cost falls on the host country." },
  { id: "route", headline: "The hidden route is a ceiling, not a channel", stake: "The dependence is bounded." },
];
export const VERDICT_LABEL: Record<Verdict, string> = { holds: "Holds on the record", part: "Holds in part", fails: "Fails on the record", open: "Cannot be settled here" };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const share = (r: FlowTradeRow) => (r.exports_musd.WLD != null && r.exports_musd.WLD > 0 && r.exports_musd.CN != null ? r.exports_musd.CN / r.exports_musd.WLD : null);

/** China's share of each country's reported exports (all minerals) by country and year, and the region's summed share by year. */
export function chinaShares(trade: readonly FlowTradeRow[], scope: readonly string[]) {
  const set = new Set(scope);
  const by = new Map<string, number>();
  const region = new Map<number, { cn: number; wld: number }>();
  for (const r of trade) {
    if (r.mineral !== "all" || !set.has(r.iso3)) continue;
    const s = share(r);
    if (s == null) continue;
    by.set(`${r.iso3}|${r.year}`, s);
    const t = region.get(r.year) ?? { cn: 0, wld: 0 };
    t.cn += r.exports_musd.CN!;
    t.wld += r.exports_musd.WLD!;
    region.set(r.year, t);
  }
  const regionShare = new Map(Array.from(region.entries()).map(([y, t]) => [y, t.wld > 0 ? t.cn / t.wld : null]));
  return { by, regionShare };
}

export interface Turn { iso3: string; year: number; name: string; from: string; to: string; before: number | null; after: number | null; change: number | null; net: number | null; direction: "right" | "left" | "centre" }

/**
 * Every change of government that changed the coded orientation (the prototype's terms, six focus countries): China's share
 * of the country's exports in the three years after the inauguration minus the three before, and the same change net of
 * the region's own move over the same years. Needs two of three years on each side.
 */
export function turnsVsOre(terms: StageRecords["TERMS"], trade: readonly FlowTradeRow[], scope: readonly string[]): Turn[] {
  const { by, regionShare } = chinaShares(trade, scope);
  const out: Turn[] = [];
  for (const [iso3, list] of Object.entries(terms)) {
    for (let i = 1; i < list.length; i++) {
      const [y0, name, ori] = list[i];
      const prev = list[i - 1][2];
      if (ori === prev) continue;
      const year = Math.floor(y0);
      const window = (from: number, to: number, get: (y: number) => number | null | undefined) => {
        const xs: number[] = [];
        for (let y = from; y <= to; y++) {
          const v = get(y);
          if (v != null) xs.push(v);
        }
        return xs.length >= 2 ? mean(xs) : null;
      };
      const before = window(year - 3, year - 1, (y) => by.get(`${iso3}|${y}`));
      const after = window(year + 1, year + 3, (y) => by.get(`${iso3}|${y}`));
      const rBefore = window(year - 3, year - 1, (y) => regionShare.get(y));
      const rAfter = window(year + 1, year + 3, (y) => regionShare.get(y));
      const change = before != null && after != null ? after - before : null;
      const net = change != null && rBefore != null && rAfter != null ? change - (rAfter - rBefore) : null;
      out.push({ iso3, year, name, from: prev, to: ori, before, after, change, net, direction: ori === "R" ? "right" : ori === "L" ? "left" : "centre" });
    }
  }
  return out.sort((a, b) => a.year - b.year || a.iso3.localeCompare(b.iso3));
}

export function turnSummary(turns: Turn[]) {
  const right = turns.filter((t) => t.direction === "right" && t.change != null);
  const left = turns.filter((t) => t.direction === "left" && t.change != null);
  const up = (xs: Turn[]) => xs.filter((t) => (t.change ?? 0) > 0).length;
  return {
    right: { n: right.length, up: up(right), mean: mean(right.map((t) => t.change!)), meanNet: mean(right.filter((t) => t.net != null).map((t) => t.net!)) },
    left: { n: left.length, up: up(left), mean: mean(left.map((t) => t.change!)), meanNet: mean(left.filter((t) => t.net != null).map((t) => t.net!)) },
    tested: turns.filter((t) => t.change != null).length,
    untested: turns.filter((t) => t.change == null).length,
  };
}

/** Documented Chinese and US commitments by year (million US$), and the region's China export share in the same years. */
export function lendingVsOre(finance: readonly FlowFinanceRow[], trade: readonly FlowTradeRow[], scope: readonly string[]) {
  const set = new Set(scope);
  const by = new Map<number, { CN: number; US: number }>();
  for (const r of finance) {
    if (!set.has(r.iso3)) continue;
    const t = by.get(r.year) ?? { CN: 0, US: 0 };
    t[r.origin] += r.amount_musd;
    by.set(r.year, t);
  }
  const { regionShare } = chinaShares(trade, scope);
  const years = Array.from(by.keys()).filter((y) => y >= 2000).sort((a, b) => a - b);
  const rows = years.map((y) => ({ year: y, CN: by.get(y)!.CN, US: by.get(y)!.US, share_cn: regionShare.get(y) ?? null }));
  const peak = rows.reduce<typeof rows[number] | null>((p, r) => (r.CN > (p?.CN ?? -1) ? r : p), null);
  const lastCN = rows.filter((r) => r.CN > 0).at(-1) ?? null;
  return { rows, peak, lastCN };
}

/** Reported inward direct-investment positions held by each counterpart in the latest year both are reported, summed over the reporting countries. */
export function capitalVsOre(inv: InvestmentFile) {
  const reported = inv.region.filter((r) => r.basis === "reported");
  const years = new Set(reported.filter((r) => r.counterpart === "USA").map((r) => r.year));
  const common = reported.filter((r) => r.counterpart === "CHN" && years.has(r.year)).map((r) => r.year);
  if (!common.length) return null;
  const year = Math.max(...common);
  const at = (c: string) => reported.find((r) => r.counterpart === c && r.year === year) ?? null;
  return { year, USA: at("USA"), CHN: at("CHN"), HKG: at("HKG") };
}

/** Each mineral's China and US shares of the region's reported exports in the latest year, sorted by China's share. */
export function mineralSplit(rows: readonly MineralShareRow[]) {
  const year = Math.max(...rows.map((r) => r.year));
  const latest = rows.filter((r) => r.year === year).sort((a, b) => b.share_cn - a.share_cn);
  return { year, rows: latest, chinaLed: latest.filter((r) => r.share_cn > r.share_us), usLed: latest.filter((r) => r.share_us > r.share_cn).sort((a, b) => b.share_us - a.share_us) };
}

/** The panel rows for China's export share: does anything the two powers do show up in the ore? */
export function panelNull(rows: readonly InsightRegression[]) {
  const cn = rows.filter((r) => r.outcome === "export_share_cn" && r.coef != null);
  const significant = cn.filter((r) => (r.p_wild ?? 1) < 0.05);
  return { rows: cn, significant, n_obs: cn[0]?.n_obs ?? null, n_countries: cn[0]?.n_countries ?? null, years: cn[0]?.years ?? null };
}

/** Each country's latest year with both China components: the export share to China and UN-vote alignment with China, on the 0–100 component scale. */
export function votesVsOre(components: readonly ComponentRow[]) {
  const latest = new Map<string, { year: number; trade: number; votes: number }>();
  const cells = new Map<string, Partial<Record<"trade" | "votes", number>>>();
  for (const c of components) {
    if (c.a !== "CN" || !c.ok || c.norm == null) continue;
    if (c.k !== "trade_export_share" && c.k !== "diplomatic_alignment") continue;
    const key = `${c.c}|${c.y}`;
    const cell = cells.get(key) ?? {};
    cell[c.k === "trade_export_share" ? "trade" : "votes"] = c.norm;
    cells.set(key, cell);
  }
  for (const [key, cell] of cells) {
    if (cell.trade == null || cell.votes == null) continue;
    const [iso3, y] = key.split("|");
    const year = Number(y);
    const cur = latest.get(iso3);
    if (!cur || year > cur.year) latest.set(iso3, { year, trade: cell.trade, votes: cell.votes });
  }
  const rows = Array.from(latest.entries()).map(([iso3, v]) => ({ iso3, ...v })).sort((a, b) => b.trade - a.trade);
  const votesMin = rows.length ? Math.min(...rows.map((r) => r.votes)) : null;
  const votesMax = rows.length ? Math.max(...rows.map((r) => r.votes)) : null;
  const lowTradeHighVotes = rows.filter((r) => r.trade < 25 && r.votes >= 50);
  const lowest = rows.length ? rows.reduce((p, r) => (r.votes < p.votes ? r : p), rows[0]) : null;
  return { rows, votesMin, votesMax, lowest, lowTradeHighVotes, correlation: pearson(rows.map((r) => r.trade), rows.map((r) => r.votes)) };
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n))!, my = mean(ys.slice(0, n))!;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** US policy documents and statements by year against Chinese and US commitments: did attention follow the money, or arrive after it left? */
export function attentionVsMoney(att: readonly AttentionYear[]) {
  const both = att.filter((a) => a.cn_musd != null);
  const corr = pearson(both.map((a) => a.policy_docs), both.map((a) => a.cn_musd!));
  const peakMoney = both.reduce<AttentionYear | null>((p, a) => (a.cn_musd! > (p?.cn_musd ?? -1) ? a : p), null);
  const peakDocs = both.reduce<AttentionYear | null>((p, a) => (a.policy_docs > (p?.policy_docs ?? -1) ? a : p), null);
  const lastThree = both.slice(-3);
  return { years: both.length, corr, peakMoney, peakDocs, lastThree, span: both.length ? [both[0].year, both[both.length - 1].year] : null };
}

/** The statement blocs: how often each side's officials take a position, and how often Latin American executives name neither power. */
export function talkPattern(region: InsightRegion) {
  const bloc = (name: string) => region.talk_vs_money.by_bloc.find((b) => b.bloc === name) ?? null;
  const us = bloc("United States"), cn = bloc("China"), latam = bloc("LatAm executive");
  const positions = (b: { stance: { cn: Record<string, number>; us: Record<string, number> } } | null, side: "cn" | "us") => {
    if (!b) return null;
    const s = b.stance[side];
    const total = s.positive + s.neutral + s.mixed + s.negative;
    return { total, negative: s.negative, positive: s.positive };
  };
  return {
    us: us ? { n: us.n, onChina: positions(us, "cn") } : null,
    cn: cn ? { n: cn.n, onChina: positions(cn, "cn") } : null,
    latam: latam ? { n: latam.n, neitherCn: latam.stance.cn.not_mentioned, neitherUs: latam.stance.us.not_mentioned, both: latam.n - Math.max(latam.stance.cn.not_mentioned, latam.stance.us.not_mentioned) } : null,
    finance: region.talk_vs_money.finance,
    ratios: region.talk_vs_money.ratios,
  };
}

/** The companion study's sixteen cases, counted by what happened to the Chinese-linked option and whether a cause is documented. */
export function pressureCases(cases: StageRecords["CASES"]) {
  const removed = cases.filter((c) => ["Cancelled", "Delayed or frozen", "Transferred", "Modified", "Restricted"].includes(c.outcome));
  const unchanged = cases.filter((c) => c.outcome === "No observable change");
  const documented = cases.filter((c) => c.cause === "documented");
  const altPartial = cases.filter((c) => c.alt === "partial");
  const altFull = cases.filter((c) => c.alt === "yes" || c.alt === "full");
  return { n: cases.length, removed: removed.length, unchanged: unchanged.length, documented: documented.length, altPartial: altPartial.length, altFull: altFull.length };
}
