import { fmtMusd, fmtPct, fmtSigned } from "./format";
import { latestYear, type FinanceYear, type InvestmentYear, type LeanYear, type TradeYear, type VotesYear } from "./overview";

/**
 * "Who is winning", measure by measure, from the region-wide series the whole-picture chapter computes. Each verdict
 * names the actor the measure favours in the latest year the series holds, with the figures and the count of
 * countries behind it; the sentence is templated, the numbers are the exports'. The overall reading is interpretation
 * and is written on the page, not here.
 */
export type Favours = "CN" | "US" | "neither" | "unknown";

export interface MeasureVerdict {
  id: "trade" | "finance" | "investment" | "votes" | "index";
  label: string;
  favours: Favours;
  year: number | null;
  /** the figures, one sentence */
  statement: string;
  /** what keeps the measure from settling the question */
  caveat: string;
  layer: "facts" | "model";
}

export function verdicts(o: { trade: TradeYear[]; finance: FinanceYear[]; votes: VotesYear[]; lean: LeanYear[]; investment: InvestmentYear[] }, lastYear: { trade: number | null; finance_CN: number | null }, maxYear: number): MeasureVerdict[] {
  const out: MeasureVerdict[] = [];
  const t = latestYear(o.trade, lastYear.trade ?? maxYear);
  if (t && t.share_cn != null && t.share_us != null) {
    out.push({ id: "trade", label: "Who buys the ore", layer: "facts", year: t.year, favours: t.share_cn > t.share_us ? "CN" : t.share_us > t.share_cn ? "US" : "neither",
      statement: `${fmtPct(t.share_cn, 0)} of the reporting countries' mineral exports went to China and ${fmtPct(t.share_us, 0)} to the United States in ${t.year} (${t.n_cn} countries with both partner cells).`,
      caveat: "Reporter's own figures; a country without a partner row is absent from the share, and the two partners' refining capacity, not shown here, is part of why the ore goes where it goes." });
  } else out.push({ id: "trade", label: "Who buys the ore", layer: "facts", year: null, favours: "unknown", statement: "No year with both partner cells.", caveat: "" });
  const fin = o.finance.filter((f) => f.year >= 2000);
  const sumCN = fin.filter((f) => lastYear.finance_CN == null || f.year <= lastYear.finance_CN).reduce((s, f) => s + f.CN.amount, 0);
  const sumUS = fin.reduce((s, f) => s + f.US.amount, 0);
  if (sumCN > 0 || sumUS > 0) {
    out.push({ id: "finance", label: "Who writes the cheques", layer: "facts", year: lastYear.finance_CN, favours: sumCN > sumUS ? "CN" : sumUS > sumCN ? "US" : "neither",
      statement: `Documented commitments since 2000: ${fmtMusd(sumCN)} from Chinese institutions (record to ${lastYear.finance_CN ?? "–"}) against ${fmtMusd(sumUS)} of US DFC and EXIM authorisations.`,
      caveat: "The Chinese record ends where its source ends and the large years are a decade old; the US figures are authorisations, not disbursements; swap drawdowns are kept apart." });
  }
  const inv = o.investment.length ? o.investment[o.investment.length - 1] : null;
  if (inv && (inv.CN != null || inv.US != null)) {
    const cn = (inv.CN ?? 0) + (inv.HK ?? 0);
    out.push({ id: "investment", label: "Who owns the capital", layer: "facts", year: inv.year, favours: inv.US != null && inv.US > cn ? "US" : cn > (inv.US ?? 0) ? "CN" : "neither",
      statement: `Inward direct-investment stock in ${inv.year}, the countries' own surveys: ${inv.CN != null ? fmtMusd(inv.CN) : "—"} held by China${inv.HK != null ? ` plus ${fmtMusd(inv.HK)} by Hong Kong SAR` : ""} against ${inv.US != null ? fmtMusd(inv.US) : "—"} by the United States (${inv.n_cn} and ${inv.n_us} reporting countries).`,
      caveat: "Stocks, not flows; the counterparts' own figures for the same stocks differ, and capital routed through third places is counted where it is booked." });
  } else out.push({ id: "investment", label: "Who owns the capital", layer: "facts", year: null, favours: "unknown", statement: "No investment positions in this release yet.", caveat: "The IMF positions fill with the next run." });
  const v = latestYear(o.votes, maxYear);
  if (v && v.CN != null && v.US != null) {
    out.push({ id: "votes", label: "Who they vote with", layer: "facts", year: v.year, favours: v.CN > v.US ? "CN" : v.US > v.CN ? "US" : "neither",
      statement: `In ${v.year} the ${v.n} countries with both values voted with China ${fmtPct(v.CN, 0)} of the time and with the United States ${fmtPct(v.US, 0)}.`,
      caveat: "Agreement rates on the General Assembly's contested votes, where most of the Global South votes together; the gap was as wide at the start of the record as at the end." });
  }
  const l = latestYear(o.lean, maxYear);
  if (l && l.net != null) {
    out.push({ id: "index", label: "The index", layer: "model", year: l.year, favours: l.net > 0 ? "CN" : l.net < 0 ? "US" : "neither",
      statement: `The composite's mean net lean in ${l.year} is ${fmtSigned(l.net, 1)} (China minus the United States) over ${l.n} countries; ${l.lean_cn} lean China, ${l.lean_us} the United States.`,
      caveat: "A model output: equal weights over the components available, on a 0–100 scale relative to this record's own range; a change in the component count is a coverage change, not a swing." });
  }
  return out;
}

export function tally(vs: MeasureVerdict[]): { CN: number; US: number; open: number } {
  return { CN: vs.filter((v) => v.favours === "CN").length, US: vs.filter((v) => v.favours === "US").length, open: vs.filter((v) => v.favours === "neither" || v.favours === "unknown").length };
}
