/**
 * "Against the grain": claims that cut across the usual story of the rivalry, each tested on this site's own record.
 * Every number here is computed from the loaded files; the wording of the claim and the verdict is interpretation and
 * says so on the page. Nothing is estimated: where a test cannot be run on the record, the function says why.
 */
import type { StageRecords } from "@/lib/stage";
import type { ComponentRow } from "@/lib/geometry";
import type { AttentionYear, EventEcho, FlowFinanceRow, FlowTradeRow, IndexRow, InsightCountry, InsightRegion, InsightRegression, InvestmentFile, MineralShareRow, PriceSeries } from "@/lib/types";

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
  { id: "three", headline: "Three countries are China's share", stake: "The region that leans to China is three exporters." },
  { id: "prices", headline: "Prices did most of the lifting", stake: "The value story is a price story; the shares are the political one." },
  { id: "echoes", headline: "US measures coincide with the US losing share, not China", stake: "The instruments move the wrong line." },
  { id: "flips", headline: "The index is stable where it matters and noisy where it does not", stake: "A turn toward China is only meaningful for the big exporters, which never turned." },
  { id: "warm", headline: "Warm words for Washington, no trade with it", stake: "Praise and purchases run opposite." },
  { id: "hongkong", headline: "Hong Kong does not hide the Chinese stake", stake: "Tested because it is the usual objection to the capital claim." },
  { id: "fans", headline: "The forecast does not tell us where this goes", stake: "How wide the 2030 fans are against the history." },
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

/* ---- the second set of claims ---- */

/** Who carries the region's exports to China: each country's share of the summed China cells in the latest year with at least `min` cells. */
export function chinaConcentration(trade: readonly FlowTradeRow[], scope: readonly string[], min = 10) {
  const set = new Set(scope);
  const byYear = new Map<number, Map<string, number>>();
  for (const r of trade) {
    if (r.mineral !== "all" || !set.has(r.iso3) || r.exports_musd.CN == null) continue;
    const m = byYear.get(r.year) ?? new Map<string, number>();
    m.set(r.iso3, r.exports_musd.CN);
    byYear.set(r.year, m);
  }
  const years = Array.from(byYear.entries()).filter(([, m]) => m.size >= min).map(([y]) => y);
  if (!years.length) return null;
  const year = Math.max(...years);
  const m = byYear.get(year)!;
  const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
  const rows = Array.from(m.entries()).map(([iso3, musd]) => ({ iso3, musd, share: total > 0 ? musd / total : 0 })).sort((a, b) => b.musd - a.musd);
  const top3 = rows.slice(0, 3);
  return { year, total, n: rows.length, rows, top3, top3Share: top3.reduce((a, r) => a + r.share, 0) };
}

/** The region's export value by year (summed world totals) against a price series, with the years that mark the shape. */
export function pricesVsValue(prices: Record<string, PriceSeries>, trade: readonly FlowTradeRow[], scope: readonly string[], key = "copper") {
  const set = new Set(scope);
  const value = new Map<number, number>();
  for (const r of trade) {
    if (r.mineral !== "all" || !set.has(r.iso3) || r.exports_musd.WLD == null) continue;
    value.set(r.year, (value.get(r.year) ?? 0) + r.exports_musd.WLD);
  }
  const p = prices[key];
  if (!p) return null;
  const price = new Map(p.annual.map((a) => [a.year, a.avg]));
  const years = Array.from(value.keys()).filter((y) => price.has(y)).sort((a, b) => a - b);
  if (years.length < 5) return null;
  const rows = years.map((y) => ({ year: y, value: value.get(y)!, price: price.get(y)! }));
  const corr = pearson(rows.map((r) => r.value), rows.map((r) => r.price));
  const peak = rows.reduce((a, r) => (r.value > a.value ? r : a), rows[0]);
  const trough = rows.filter((r) => r.year > peak.year).reduce<typeof rows[number] | null>((a, r) => (!a || r.value < a.value ? r : a), null);
  return { key, unit: p.unit, series: p.series, rows, corr, first: rows[0], peak, trough, last: rows[rows.length - 1] };
}

/** Event echoes grouped by family (two or more windows): the mean change of each actor's export share after the family's events. */
export function echoFamilies(echoes: readonly EventEcho[]) {
  const fam = new Map<string, { label: string; event_actor: string; n: number; CN: number | null; US: number | null }>();
  for (const e of echoes) {
    if (e.n < 2) continue;
    const f = fam.get(e.family) ?? { label: e.label, event_actor: e.event_actor, n: e.n, CN: null, US: null };
    f[e.actor] = e.mean;
    fam.set(e.family, f);
  }
  const rows = Array.from(fam.values()).sort((a, b) => b.n - a.n);
  const usMeasures = rows.filter((r) => r.event_actor === "US");
  const usLose = usMeasures.filter((r) => r.US != null && r.US < 0).length;
  return { rows, usMeasures, usLose };
}

/** Net lean (China minus US, composite, all minerals) by country and year: how often its sign changed, and where it stands. */
export function leanFlips(rows: readonly IndexRow[]) {
  const by = new Map<string, Map<number, Partial<Record<"CN" | "US", number>>>>();
  for (const r of rows) {
    if ((r.index ?? "composite") !== "composite" || r.mineral !== "all" || r.value == null) continue;
    const m = by.get(r.iso3) ?? new Map();
    const cell = m.get(r.year) ?? {};
    cell[r.actor] = r.value;
    m.set(r.year, cell);
    by.set(r.iso3, m);
  }
  const out: { iso3: string; years: number; flips: number; last: number; lastYear: number; nearZero: number }[] = [];
  for (const [iso3, m] of by) {
    const series = Array.from(m.entries()).filter(([, c]) => c.CN != null && c.US != null).map(([y, c]) => ({ y, lean: c.CN! - c.US! })).sort((a, b) => a.y - b.y);
    if (series.length < 2) continue;
    let flips = 0;
    for (let i = 1; i < series.length; i++) if (series[i].lean > 0 !== series[i - 1].lean > 0) flips++;
    const last = series[series.length - 1];
    out.push({ iso3, years: series.length, flips, last: last.lean, lastYear: last.y, nearZero: series.filter((s) => Math.abs(s.lean) < 10).length / series.length });
  }
  return out.sort((a, b) => b.flips - a.flips);
}

/** Executives coded warm toward an actor whose exports barely go there: the words-against-trade contrasts for that actor. */
export function warmWordsNoTrade(countries: readonly InsightCountry[], actor: "US" | "CN" = "US") {
  const rows = countries
    .flatMap((c) => c.contrasts.filter((x) => x.kind === "words_vs_trade" && x.actor === actor && x.stance != null && x.share != null).map((x) => ({ iso3: c.iso3, stance: x.stance as number, n: x.n as number, share: x.share as number, year: x.trade_year as number })))
    .sort((a, b) => b.stance - a.stance);
  return { rows, warmNoTrade: rows.filter((r) => r.stance >= 0.5 && r.share < 0.1), coolTrade: rows.filter((r) => r.stance < 0.5 && r.share >= 0.25) };
}

/** Each country's latest reported inward positions from mainland China and Hong Kong SAR: where the Hong Kong channel is larger. */
export function hongKongChannel(inv: InvestmentFile) {
  const latest = new Map<string, { CHN?: { year: number; musd: number }; HKG?: { year: number; musd: number } }>();
  for (const r of inv.positions) {
    if (r.direction !== "inward" || r.basis !== "reported" || (r.counterpart !== "CHN" && r.counterpart !== "HKG")) continue;
    const e = latest.get(r.iso3) ?? {};
    const cur = e[r.counterpart];
    if (!cur || r.year > cur.year) e[r.counterpart] = { year: r.year, musd: r.musd };
    latest.set(r.iso3, e);
  }
  const rows = Array.from(latest.entries()).map(([iso3, e]) => ({ iso3, ...e })).filter((r) => r.CHN || r.HKG).sort((a, b) => (b.HKG?.musd ?? 0) - (a.HKG?.musd ?? 0));
  const hkLarger = rows.filter((r) => (r.HKG?.musd ?? 0) > (r.CHN?.musd ?? 0) && (r.HKG?.musd ?? 0) >= 1000);
  const hkTotal = rows.reduce((a, r) => a + Math.max(0, r.HKG?.musd ?? 0), 0);
  const cnTotal = rows.reduce((a, r) => a + Math.max(0, r.CHN?.musd ?? 0), 0);
  return { rows, hkLarger, hkTotal, cnTotal };
}

/** The published fan for each country's share to China at the horizon against the whole range the share has covered in the record. */
export function fanWidth(countries: readonly InsightCountry[], horizon = 2030) {
  const rows: { iso3: string; width: number; range: number; p05: number; p95: number; min: number; max: number }[] = [];
  for (const c of countries) {
    const path = c.forecast?.paths.export_share?.CN?.baseline;
    const at = path?.find((p) => p.year === horizon);
    const hist = c.trade_series.map((t) => t.share_cn).filter((v): v is number => v != null);
    if (!at || hist.length < 5) continue;
    const min = Math.min(...hist), max = Math.max(...hist);
    rows.push({ iso3: c.iso3, width: at.p95 - at.p05, range: max - min, p05: at.p05, p95: at.p95, min, max });
  }
  return { rows: rows.sort((a, b) => b.width - a.width), wider: rows.filter((r) => r.width >= r.range), medianWidth: rows.length ? rows.map((r) => r.width).sort((a, b) => a - b)[Math.floor(rows.length / 2)] : null };
}
