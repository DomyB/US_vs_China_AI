"use client";

import { COUNTRY_COUNT_WORD } from "@/lib/constants";
import { fmtMusd, fmtPct } from "@/lib/format";
import { LAST_YEAR_LABEL } from "@/lib/provenance";
import type { QuantFile } from "@/lib/types";
import { Exhibit, KeyNumber } from "../Chapter";

type Lender = QuantFile["network"]["top_lenders"][number];

/** The swap-line lender: its network weight is the central-bank drawdowns the iceberg shows apart (the export carries no per-lender swap flag). */
const isSwapLender = (l: { label: string }) => /People.s Bank of China/.test(l.label);
/** A lender row without a name ("Unspecified Chinese Government Institution"): a lender, not a named one. */
const isUnspecified = (l: { label: string }) => /^unspecified/i.test(l.label);

/**
 * Who lends (chapter 3's second exhibit, in the appendix): the largest lenders of the finance network by weighted degree.
 * `lastYear` is where each finance record ends (flows.meta.last_year), printed by the evidence drawer.
 */
export function LenderRanking({ network, lastYear }: { network: QuantFile["network"]; lastYear: { finance_CN: number | null; finance_US: number | null } }) {
  const lenders: Lender[] = network.top_lenders ?? [];
  const named = lenders.filter((l) => !isUnspecified(l));
  const unnamed = lenders.length - named.length;
  const namedCN = named.filter((l) => l.origin === "CN").length, namedUS = named.filter((l) => l.origin === "US").length;
  const swapLender = lenders.find(isSwapLender);
  const max = Math.max(...lenders.map((x) => x.weighted_degree_musd), 1);
  const sum = lenders.reduce((s, l) => s + l.weighted_degree_musd, 0);
  const top = lenders[0] ?? null;
  const topThree = lenders.slice(0, 3).reduce((s, l) => s + l.weighted_degree_musd, 0);
  const financeLastYears = { [LAST_YEAR_LABEL.finance_CN]: lastYear.finance_CN, [LAST_YEAR_LABEL.finance_US]: lastYear.finance_US };
  return (
    <Exhibit
      id="c3-lenders"
      title={`Who lends: the ${lenders.length} largest lenders`}
      layer="facts"
      asks="Behind the two origins, which institutions do the lending, and how concentrated is it? A ranked list of the largest lenders by the money on their links shows whether a handful of banks carry the record."
      how="One row per lender, largest first: the bar is its weighted degree as a share of the largest, in China's or the United States' colour and hatched for the swap-line lender; the figures at the right are the sum and the number of lender–recipient links."
      findings={[
        top ? `${top.label} leads with ${fmtMusd(top.weighted_degree_musd)} over ${top.degree} links.` : null,
        sum > 0 ? `The ${lenders.length} rows carry ${fmtMusd(sum)} in all; the first ${Math.min(3, lenders.length)} hold ${fmtPct(topThree / sum, 0)} of it.` : null,
        `${namedCN} named Chinese institution${namedCN === 1 ? "" : "s"} and ${namedUS} named US one${namedUS === 1 ? "" : "s"}${unnamed > 0 ? `; ${unnamed} row${unnamed === 1 ? "" : "s"} unnamed` : ""}.`,
      ]}
      findingsKind="facts"
      says={`${namedCN} named Chinese institution${namedCN === 1 ? "" : "s"} and ${namedUS} named US one${namedUS === 1 ? "" : "s"} among the ${lenders.length}${unnamed > 0 ? `, with ${unnamed} row${unnamed === 1 ? "" : "s"} unnamed` : ""}; the weight includes the swap drawdowns and lower-confidence amounts the iceberg keeps apart, so a rank here is not a rank on the documented ledger.`}
      saysKind="facts"
      sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations"]}
      ids={["network:top_lenders"]}
      lastYear={financeLastYears}
      note={`Weighted degree is the sum of every recorded amount on the lender's links across the ${COUNTRY_COUNT_WORD} countries, all years, swap drawdowns and lower-confidence amounts included, so it is not the documented ledger above the waterline${swapLender ? `: the ${swapLender.label} row is the central-bank swap drawdowns the iceberg shows apart, almost all Argentina's, drawn hatched here` : ""}. Degree is the number of lender–recipient links.${unnamed > 0 ? ` ${unnamed === 1 ? "One row is" : `${unnamed} rows are`} an unspecified Chinese government institution: a lender, not a named one.` : ""}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ul className="space-y-1.5 text-sm">
          {lenders.map((l) => {
            const color = l.origin === "US" ? "var(--us)" : "var(--cn)";
            return (
              <li key={l.label} className="grid grid-cols-1 gap-x-2 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="block break-words">{l.label}</span>
                  <span className="block h-1.5 rounded-sm" style={{ width: `${Math.max(2, (l.weighted_degree_musd / max) * 100)}%`, background: isSwapLender(l) ? `repeating-linear-gradient(-45deg, ${color} 0 2px, transparent 2px 5px)` : color }} />
                </span>
                <span className="tabular-nums text-xs text-ink-2">{fmtMusd(l.weighted_degree_musd)} · {l.degree} links</span>
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-2 gap-4 self-start">
          <KeyNumber value={namedCN} label={`named Chinese institution${namedCN === 1 ? "" : "s"} among them`} tone="cn" size="text-3xl" />
          <KeyNumber value={namedUS} label={`named US institution${namedUS === 1 ? "" : "s"} among them`} tone="us" size="text-3xl" />
        </div>
      </div>
    </Exhibit>
  );
}
