/**
 * The executive summary at the top of the home: one finding per number, each computed from the loaded files by the same
 * functions the arguments page uses (nothing is re-derived here, nothing is typed). A finding whose rows are missing
 * carries a null number and a sentence saying what is absent; the page prints the sentence in the number's place.
 * The wording of the card titles is the team's reading, AI-drafted; the findings themselves describe, in the layer of
 * the chart they come from (facts or a model output).
 */
import { COUNTRY_NAMES } from "@/lib/constants";
import { attentionVsMoney, capitalVsOre, chinaConcentration, claimHref, hongKongChannel, lendingVsOre, mineralSplit, panelNull, pricesVsValue, talkPattern, turnSummary, turnsVsOre } from "@/lib/contested";
import { fmtMusd, fmtPct, fmtSigned } from "@/lib/format";
import { latestYear, type TradeYear } from "@/lib/overview";
import type { StageRecords } from "@/lib/stage";
import type { FlowFinanceRow, FlowTradeRow, IndexRow, InsightRegion, InsightRegression, InvestmentFile, MineralShareRow } from "@/lib/types";

export interface SummaryInputs {
  /** the region's yearly trade totals (`tradeByYear` over the scope) */
  trade: readonly TradeYear[];
  lastTradeYear: number | null;
  tradeRows: readonly FlowTradeRow[] | null;
  financeRows: readonly FlowFinanceRow[] | null;
  region: InsightRegion | null;
  investment: InvestmentFile | null;
  /** the region's per-mineral shares; empty when the layer is sample */
  shares: readonly MineralShareRow[];
  terms: StageRecords["TERMS"] | null;
  regressions: readonly InsightRegression[];
  indexRows: readonly IndexRow[] | null;
  scope: readonly string[];
}

export interface Finding {
  id: string;
  /** one descriptive line, in the layer of its chart */
  headline: string;
  /** the key figure as printed, null when its rows are missing */
  number: string | null;
  detail: string;
  kind: "facts" | "model";
  /** where the finding is tested */
  href: string;
  sources: string[];
  /** the years the figure covers, as printed */
  years: string | null;
  /** what is missing when `number` is null */
  absent?: string;
}

export type SummaryCardId = "shares" | "money" | "capital" | "minerals" | "politics";
export interface SummaryCard {
  id: SummaryCardId;
  /** the card's reading of its findings (interpretation, AI-drafted) */
  title: string;
  lead: Finding;
  more: Finding[];
}

const name = (iso: string) => COUNTRY_NAMES[iso] ?? iso;
const pts = (v: number) => `${fmtSigned(v * 100, 1)} pts`;
const plain = (mineral: string) => mineral.replace(/_/g, " ");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const absent = (id: string, headline: string, kind: Finding["kind"], href: string, sources: string[], what: string): Finding => ({ id, headline, number: null, detail: what, kind, href, sources, years: null, absent: what });

/** China's share of the region's reported mineral exports in the first and the latest year with both buyers reported. */
export function sharesFinding(i: SummaryInputs): Finding {
  const id = "shares", href = "/story#c0-trade", sources = ["un_comtrade"];
  const headline = "China's share of the region's reported mineral exports, first to latest year with both buyers";
  // the same two years as the home's tiles: the first with both buyers reported, the latest at or before the trade record's end
  const t0 = i.trade.find((y) => y.n_cn > 0 && y.n_us > 0) ?? null;
  const last = i.lastTradeYear ?? (i.trade.length ? i.trade[i.trade.length - 1].year : null);
  const t = last != null ? latestYear(i.trade.slice(), last) : null;
  if (!t0 || !t || t0.share_cn == null || t.share_cn == null || t0.share_us == null || t.share_us == null) return absent(id, headline, "facts", href, sources, "No year with both buyers reported in the trade file.");
  return {
    id,
    headline: `China's share of the region's reported mineral exports went from ${fmtPct(t0.share_cn, 0)} in ${t0.year} to ${fmtPct(t.share_cn, 0)} in ${t.year}`,
    number: `${fmtPct(t0.share_cn, 0)} → ${fmtPct(t.share_cn, 0)}`,
    detail: `The US share of the same exports went from ${fmtPct(t0.share_us, 0)} to ${fmtPct(t.share_us, 0)} between ${t0.year} and ${t.year}, summed over the countries reporting both buyers (${t0.n_cn} and ${t.n_cn} for China).`,
    kind: "facts",
    href,
    sources,
    years: `${t0.year}–${t.year}`,
  };
}

/** The region's export value against the copper price: the correlation across the years both are known. */
export function pricesFinding(i: SummaryInputs): Finding {
  const id = "prices", href = claimHref("prices");
  const headline = "Correlation of the region's export value with the copper price";
  const p = i.region && i.tradeRows ? pricesVsValue(i.region.prices, i.tradeRows, i.scope, "copper") : null;
  if (!p || p.corr == null) return absent(id, headline, "facts", href, ["un_comtrade"], "No copper price series, or too few years with both value and price, in this release.");
  return {
    id,
    headline: `Export value moved with the copper price across ${p.rows.length} years (r = ${p.corr.toFixed(2)})`,
    number: `r = ${p.corr.toFixed(2)}`,
    detail: `${p.first.year}: ${fmtMusd(p.first.value)}; peak ${p.peak.year}: ${fmtMusd(p.peak.value)}${p.trough && p.trough.year !== p.last.year ? `; ${p.trough.year}: ${fmtMusd(p.trough.value)}` : ""}; ${p.last.year}: ${fmtMusd(p.last.value)}, each year's summed world totals against the ${p.series}.`,
    kind: "facts",
    href,
    sources: ["un_comtrade", "wb_pink_sheet"],
    years: `${p.first.year}–${p.last.year}`,
  };
}

/** The three largest exporters to China and their share of the summed China cells. */
export function threeFinding(i: SummaryInputs): Finding {
  const id = "three", href = claimHref("three"), sources = ["un_comtrade"];
  const headline = "Share of the region's reported exports to China carried by the three largest exporters";
  const c = i.tradeRows ? chinaConcentration(i.tradeRows, i.scope) : null;
  if (!c) return absent(id, headline, "facts", href, sources, "No year with China cells for enough reporting countries in the trade file.");
  return {
    id,
    headline: `${list(c.top3.map((r) => name(r.iso3)))} carried ${fmtPct(c.top3Share, 0)} of the region's reported exports to China in ${c.year}`,
    number: fmtPct(c.top3Share, 0),
    detail: `${fmtMusd(c.total)} of reported exports to China across ${c.n} reporting countries in ${c.year}; ${c.top3.map((r) => `${name(r.iso3)} ${fmtPct(r.share, 0)}`).join(", ")}; the other ${c.n - c.top3.length} together ${fmtPct(1 - c.top3Share, 0)}.`,
    kind: "facts",
    href,
    sources,
    years: String(c.year),
  };
}

/** Documented commitments by each side over the insights window, and the two ratios of words to money. */
export function talkFinding(i: SummaryInputs): Finding {
  const id = "talk", href = claimHref("talk"), sources = ["manual_statements", "aiddata_gcdf", "dfc_projects", "exim_authorizations"];
  const headline = "Documented commitments by China and by the United States over the same window";
  const t = i.region ? talkPattern(i.region) : null;
  if (!t) return absent(id, headline, "facts", href, sources, "No statements or finance window in this release.");
  const { CN, US, US_after } = t.finance;
  const ratios = t.ratios.statements_us_over_cn != null && t.ratios.money_cn_over_us_2015_21 != null ? ` ${t.ratios.statements_us_over_cn.toFixed(1)} US statements for every Chinese one; ${t.ratios.money_cn_over_us_2015_21.toFixed(1)} Chinese dollars committed for every American one.` : "";
  return {
    id,
    headline: `Commitments ${CN.years[0]}–${CN.years[1]}: China ${fmtMusd(CN.musd)}, the United States ${fmtMusd(US.musd)}`,
    number: `${fmtMusd(CN.musd)} vs ${fmtMusd(US.musd)}`,
    detail: `Documented commitments ${CN.years[0]}–${CN.years[1]}: China ${fmtMusd(CN.musd)}, the United States ${fmtMusd(US.musd)}; US commitments ${US_after.years[0]}–${US_after.years[1]}: ${fmtMusd(US_after.musd)}.${ratios}${t.us && t.us.onChina ? ` US officials: ${t.us.onChina.negative} of ${t.us.onChina.total} positions on China negative.` : ""}`,
    kind: "facts",
    href,
    sources,
    years: `${CN.years[0]}–${CN.years[1]}`,
  };
}

/** Chinese commitments at their peak and in the last year with one, each with China's share of the ore that year. */
export function lendingFinding(i: SummaryInputs): Finding {
  const id = "lending", href = claimHref("lending"), sources = ["aiddata_gcdf", "un_comtrade"];
  const headline = "Chinese commitments at their peak and in the last year the source covers";
  const l = i.financeRows && i.tradeRows ? lendingVsOre(i.financeRows, i.tradeRows, i.scope) : null;
  if (!l || !l.peak || !l.lastCN) return absent(id, headline, "facts", href, sources, "No Chinese commitments in the finance file.");
  const { peak, lastCN } = l;
  return {
    id,
    headline: `Chinese commitments fell from ${fmtMusd(peak.CN)} in ${peak.year} to ${fmtMusd(lastCN.CN)} in ${lastCN.year}${peak.share_cn != null && lastCN.share_cn != null ? ` while China's share of the ore went from ${fmtPct(peak.share_cn, 0)} to ${fmtPct(lastCN.share_cn, 0)}` : ""}`,
    number: `${fmtMusd(peak.CN)} → ${fmtMusd(lastCN.CN)}`,
    detail: `Commitments peaked at ${fmtMusd(peak.CN)} in ${peak.year}${peak.share_cn != null ? `, when China took ${fmtPct(peak.share_cn, 0)} of the region's reported mineral exports` : ""}; in ${lastCN.year}, the last year with a commitment, they were ${fmtMusd(lastCN.CN)}${lastCN.share_cn != null ? ` and China's share ${fmtPct(lastCN.share_cn, 0)}` : ""}; US DFC and EXIM commitments that year ${fmtMusd(lastCN.US)}.`,
    kind: "facts",
    href,
    sources,
    years: `${peak.year}–${lastCN.year}`,
  };
}

/** The year US policy documents peaked against the year Chinese commitments peaked. */
export function attentionFinding(i: SummaryInputs): Finding {
  const id = "attention", href = claimHref("attention"), sources = ["congress_gov", "federal_register", "aiddata_gcdf"];
  const headline = "The year Chinese commitments peaked and the year US policy documents peaked";
  const a = i.region ? attentionVsMoney(i.region.attention) : null;
  if (!a || !a.peakMoney || !a.peakDocs) return absent(id, headline, "facts", href, sources, "No attention series with Chinese commitments in this release.");
  return {
    id,
    headline: `Chinese commitments peaked in ${a.peakMoney.year}; US policy documents on the region's minerals peaked in ${a.peakDocs.year}`,
    number: `${a.peakMoney.year} → ${a.peakDocs.year}`,
    detail: `Commitments peaked at ${fmtMusd(a.peakMoney.cn_musd)} in ${a.peakMoney.year}, when Washington produced ${a.peakMoney.policy_docs} documents; documents peaked at ${a.peakDocs.policy_docs} in ${a.peakDocs.year}, when commitments were ${fmtMusd(a.peakDocs.cn_musd)}${a.corr != null ? `; correlation across the ${a.years} years both are known ${a.corr.toFixed(2)}` : ""}.`,
    kind: "facts",
    href,
    sources,
    years: a.span ? `${a.span[0]}–${a.span[1]}` : null,
  };
}

/** Reported inward direct-investment positions held by the United States and by mainland China in the latest year both are reported. */
export function capitalFinding(i: SummaryInputs): Finding {
  const id = "capital", href = claimHref("capital"), sources = ["imf_dip"];
  const headline = "Inward direct-investment positions held by the United States and by mainland China";
  const c = i.investment ? capitalVsOre(i.investment) : null;
  if (!c || !c.USA || !c.CHN) return absent(id, headline, "facts", href, sources, "The investment file, or a year both counterparts report, is not in this release.");
  return {
    id,
    headline: `In ${c.year} the United States held ${fmtMusd(c.USA.musd)} of inward positions across ${c.USA.n} reporting countries, mainland China ${fmtMusd(c.CHN.musd)} across ${c.CHN.n}`,
    number: `${fmtMusd(c.USA.musd)} vs ${fmtMusd(c.CHN.musd)}`,
    detail: `Reported positions summed over the countries whose own survey carries the cell, all sectors${c.HKG ? `; Hong Kong SAR held ${fmtMusd(c.HKG.musd)} across ${c.HKG.n}, read beside the mainland figure and never added to it` : ""}.`,
    kind: "facts",
    href,
    sources,
    years: String(c.year),
  };
}

/** The Hong Kong and mainland positions summed over the reporting countries, negative positions counted as nothing. */
export function hongkongFinding(i: SummaryInputs): Finding {
  const id = "hongkong", href = claimHref("hongkong"), sources = ["imf_dip"];
  const headline = "Latest reported inward positions from Hong Kong SAR and from mainland China, summed over the reporting countries";
  const h = i.investment ? hongKongChannel(i.investment) : null;
  if (!h || !h.rows.length) return absent(id, headline, "facts", href, sources, "No country reports an inward position from mainland China or Hong Kong SAR in this release.");
  const years = h.rows.flatMap((r) => [r.CHN?.year, r.HKG?.year]).filter((y): y is number => y != null);
  return {
    id,
    headline: `Hong Kong SAR positions total ${fmtMusd(h.hkTotal)} against ${fmtMusd(h.cnTotal)} from mainland China; Hong Kong is the larger in ${h.hkLarger.length} of ${h.rows.length} reporting countries`,
    number: `${fmtMusd(h.hkTotal)} vs ${fmtMusd(h.cnTotal)}`,
    detail: `Each country's latest reported position, negative positions counted as nothing; Hong Kong SAR larger than the mainland figure in ${h.hkLarger.length} of ${h.rows.length} countries${h.hkLarger.length ? ` (${h.hkLarger.map((r) => name(r.iso3)).join(", ")})` : ""}.`,
    kind: "facts",
    href,
    sources,
    years: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : null,
  };
}

/** How many of the region's minerals China buys more of than the United States, in the latest year. */
export function mineralsFinding(i: SummaryInputs): Finding {
  const id = "minerals", href = claimHref("minerals"), sources = ["un_comtrade"];
  const headline = "Minerals in which China's share of the region's reported exports is the larger";
  if (!i.shares.length) return absent(id, headline, "facts", href, sources, "No mineral shares in this release.");
  const m = mineralSplit(i.shares);
  return {
    id,
    headline: `China takes the larger share in ${m.chinaLed.length} of ${m.rows.length} minerals in ${m.year}; the United States in ${m.usLed.length}`,
    number: `${m.chinaLed.length} of ${m.rows.length}`,
    detail: `US-led: ${m.usLed.length ? m.usLed.map((r) => `${plain(r.mineral)} ${fmtPct(r.share_us, 0)} vs ${fmtPct(r.share_cn, 0)}`).join(", ") : "none"}; China-led: ${m.chinaLed.length ? list(m.chinaLed.map((r) => plain(r.mineral))) : "none"}.`,
    kind: "facts",
    href,
    sources,
    years: String(m.year),
  };
}

/** After how many turns of government, to the right and to the left, China's share of the country's exports rose. */
export function turnsFinding(i: SummaryInputs): Finding {
  const id = "turns", href = claimHref("turns"), sources = ["un_comtrade"];
  const headline = "Changes of government after which China's share of the country's exports rose";
  if (!i.terms || !i.tradeRows) return absent(id, headline, "facts", href, sources, "The prototype's coded terms, or the trade rows, are not in this release.");
  const turns = turnsVsOre(i.terms, i.tradeRows, i.scope);
  const ts = turnSummary(turns);
  if (!ts.tested) return absent(id, headline, "facts", href, sources, "No change of orientation has enough reported years on both sides.");
  const tested = turns.filter((t) => t.change != null);
  const years = tested.map((t) => t.year);
  return {
    id,
    headline: `China's share rose after ${ts.right.up} of ${ts.right.n} turns to the right and after ${ts.left.up} of ${ts.left.n} turns to the left`,
    number: `${ts.right.up} of ${ts.right.n} · ${ts.left.up} of ${ts.left.n}`,
    detail: `Mean change net of the region's own move: ${ts.right.meanNet != null ? pts(ts.right.meanNet) : "—"} after right turns, ${ts.left.meanNet != null ? pts(ts.left.meanNet) : "—"} after left turns, over ${ts.tested} measurable turns${ts.untested ? ` (${ts.untested} without enough reported years)` : ""}; the terms and their orientation are the team's prototype coding, the shares each country's own reported exports.`,
    kind: "facts",
    href,
    sources,
    years: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : null,
  };
}

/** The panel on China's export share: how many of the levers tested are detectable. */
export function panelFinding(i: SummaryInputs): Finding {
  const id = "panel", href = claimHref("panel"), sources = ["un_comtrade", "aiddata_gcdf", "unga_votes", "vdem", "wb_wgi", "wb_wdi"];
  const headline = "Levers detectable in China's share of each country's exports, in the panel";
  const p = panelNull(i.regressions);
  if (!p.rows.length) return absent(id, headline, "model", href, sources, "No panel in this release.");
  return {
    id,
    headline: `${p.significant.length} of ${p.rows.length} coefficients in the panel on China's export share pass the wild-cluster test`,
    number: `${p.significant.length} of ${p.rows.length}`,
    detail: `China's share of each country's exports on last year's Chinese finance, UN-vote alignment, democracy, rule of law and mineral rents, with country and year fixed effects${p.n_obs != null ? `: ${p.n_obs} country-years` : ""}${p.n_countries != null ? `, ${p.n_countries} countries` : ""}${p.years ? `, ${p.years}` : ""}; ${p.significant.length ? p.significant.map((r) => `${plain(r.term)} ${fmtSigned((r.coef ?? 0) * 100, 1)} pts`).join(", ") : "no coefficient"} significant at the wild-cluster p-value.`,
    kind: "model",
    href,
    sources,
    years: p.years,
  };
}

/** The share of Latin American executive statements that name neither power (the smaller of the two "not mentioned" counts over the bloc). */
export function hedgeFinding(i: SummaryInputs): Finding {
  const id = "hedge", href = claimHref("hedge"), sources = ["manual_statements"];
  const headline = "Share of Latin American executive statements that take no position on either power";
  const t = i.region ? talkPattern(i.region) : null;
  if (!t || !t.latam || !t.latam.n) return absent(id, headline, "facts", href, sources, "No executive statements in this release.");
  const neither = Math.min(t.latam.neitherCn, t.latam.neitherUs) / t.latam.n;
  return {
    id,
    headline: `${fmtPct(neither, 0)} of ${t.latam.n} executive statements name neither power`,
    number: fmtPct(neither, 0),
    detail: `${t.latam.n} statements by Latin American executives in the dataset: ${t.latam.neitherCn} take no position on China, ${t.latam.neitherUs} none on the United States; the dataset is the owner's selection, not a census.`,
    kind: "facts",
    href,
    sources,
    years: null,
  };
}

/** In the latest index year, how many countries' composite lean is carried by UN voting agreement (the `lead` component). */
export function leadsFinding(i: SummaryInputs): Finding {
  const id = "leads", href = "/explore", sources = ["un_comtrade", "aiddata_gcdf", "dfc_projects", "unga_votes"];
  const headline = "Indexed countries whose lean between the two powers is carried by UN voting agreement";
  const set = new Set(i.scope);
  const rows = (i.indexRows ?? []).filter((r) => r.mineral === "all" && (r.index ?? "composite") === "composite" && r.lead != null && set.has(r.iso3));
  if (!rows.length) return absent(id, headline, "model", href, sources, "No composite index rows with a lead component in this release.");
  const year = Math.max(...rows.map((r) => r.year));
  const lead = new Map<string, string>();
  for (const r of rows) if (r.year === year) lead.set(r.iso3, r.lead as string);
  const n = lead.size;
  const by = new Map<string, number>();
  for (const l of lead.values()) by.set(l, (by.get(l) ?? 0) + 1);
  const votes = by.get("diplomatic_alignment") ?? 0;
  const others = Array.from(by.entries()).filter(([k]) => k !== "diplomatic_alignment").sort((a, b) => b[1] - a[1]).map(([k, v]) => `${plain(k)} ${v}`);
  return {
    id,
    headline: `In ${year} UN voting agreement is the widest gap between the two powers for ${votes} of ${n} indexed countries`,
    number: `${votes} of ${n}`,
    detail: `The component on which the two composites differ most, country by country, in ${year}: UN voting agreement ${votes}${others.length ? `; ${others.join(", ")}` : ""}.`,
    kind: "model",
    href,
    sources,
    years: String(year),
  };
}

/** The five cards of the executive summary, in reading order; the titles are the team's reading of each card's findings. */
export const CARD_TITLES: Record<SummaryCardId, string> = {
  shares: "The ore went to China, and it is a story of shares, not of value",
  money: "Beijing's money came and went before the trade peaked; Washington's attention came after",
  capital: "The customer is Chinese; the shareholder is American",
  minerals: "They are not buying the same minerals",
  politics: "Politics did not move the ore",
};

export function summaryCards(i: SummaryInputs): SummaryCard[] {
  return [
    { id: "shares", title: CARD_TITLES.shares, lead: sharesFinding(i), more: [pricesFinding(i), threeFinding(i)] },
    { id: "money", title: CARD_TITLES.money, lead: talkFinding(i), more: [lendingFinding(i), attentionFinding(i)] },
    { id: "capital", title: CARD_TITLES.capital, lead: capitalFinding(i), more: [hongkongFinding(i)] },
    { id: "minerals", title: CARD_TITLES.minerals, lead: mineralsFinding(i), more: [] },
    { id: "politics", title: CARD_TITLES.politics, lead: turnsFinding(i), more: [panelFinding(i), hedgeFinding(i), leadsFinding(i)] },
  ];
}

/** Every finding of the cards, by id (the "what is new" lines read their numbers from here). */
export const findingById = (cards: readonly SummaryCard[], id: string): Finding | null => cards.flatMap((c) => [c.lead, ...c.more]).find((f) => f.id === id) ?? null;
