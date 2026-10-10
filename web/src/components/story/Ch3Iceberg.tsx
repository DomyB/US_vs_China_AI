"use client";

import type { ReactNode } from "react";
import { COUNTRY_NAMES } from "@/lib/constants";
import { fmtMusd } from "@/lib/format";
import type { LedgerSide } from "@/lib/story";
import type { QuantFile } from "@/lib/types";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";

/** Money fills: documented = solid; lower-confidence = dots; swap drawdowns = diagonal hatch; counts = outline only. `id` prefixes the pattern ids so two figures on one page never share them. */
export function MoneyDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="var(--cn)" /></pattern>
      <pattern id={`${id}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--cn)" strokeWidth="2" /></pattern>
      <pattern id={`${id}-curtain`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeWidth="1.2" /></pattern>
    </defs>
  );
}

/**
 * A hand-drawn SVG exhibit scales its text with the viewBox, so on a phone the labels would shrink to 4–7 px. Under 640 px the
 * figure keeps `minWidth` (a Tailwind min-w utility, 1.25 × the viewBox width so an 8-unit label renders at 10 px) and scrolls sideways.
 */
export function WideFigure({ minWidth, children }: { minWidth: string; children: ReactNode }) {
  return (
    <>
      <div className="scroll-x">
        <div className={`${minWidth} sm:min-w-0`}>{children}</div>
      </div>
      <p className="mt-1 text-[11px] text-ink-3 sm:hidden" aria-hidden="true">Scroll sideways →</p>
    </>
  );
}

const bn = (musd: number) => `US$${(musd / 1000).toFixed(musd >= 10000 ? 0 : 1)} bn`;

/** The swap-line lender: its network weight is the central-bank drawdowns the iceberg shows apart (the export carries no per-lender swap flag). */
const isSwapLender = (l: { label: string }) => /People.s Bank of China/.test(l.label);
/** A lender row without a name ("Unspecified Chinese Government Institution"): a lender, not a named one. */
const isUnspecified = (l: { label: string }) => /^unspecified/i.test(l.label);

/**
 * The Iceberg: above the waterline the documented commitments by origin; below it, on a dollar axis, the lower-confidence
 * amounts and the swap drawdowns, and on a count axis the events that carry no amount or no recipient. Never summed.
 */
function Iceberg({ cn, us, unattributed }: { cn: LedgerSide; us: LedgerSide; unattributed: number | null }) {
  const W = 680, water = 200, defs = "iceberg";
  const maxDollar = Math.max(cn.documented_musd, cn.undocumented_musd, cn.swap_musd, us.documented_musd, 1);
  const h = (m: number) => Math.max(2, (m / maxDollar) * 120);
  const maxCount = Math.max(cn.no_amount_n + cn.undocumented_n + cn.swap_n, unattributed ?? 0, 1);
  const ch = (n: number) => Math.max(2, (n / maxCount) * 90);
  const noAmountAll = cn.no_amount_n + cn.undocumented_n + cn.swap_n;
  return (
    <WideFigure minWidth="min-w-[850px]">
      <svg viewBox={`0 0 ${W} 440`} className="w-full" role="img" aria-label={`Documented commitments: China ${bn(cn.documented_musd)} over ${cn.events} events, the United States ${bn(us.documented_musd)} over ${us.events}. Below the waterline: ${bn(cn.undocumented_musd)} of lower-confidence Chinese amounts, ${bn(cn.swap_musd)} of swap-line drawdowns, ${noAmountAll} events with no documented amount${unattributed !== null ? `, ${unattributed} naming no recipient` : ""}.`}>
        <MoneyDefs id={defs} />
        <text x={20} y={22} fontSize="11" fontWeight="700" className="fill-ink">ABOVE THE WATERLINE · documented, counted by the index</text>
        <g>
          <rect x={60} y={water - h(cn.documented_musd)} width={110} height={h(cn.documented_musd)} fill="var(--cn)" rx="3" />
          <text x={115} y={water - h(cn.documented_musd) - 8} textAnchor="middle" fontSize="14" fontWeight="700" className="fill-ink">{bn(cn.documented_musd)}</text>
          <text x={115} y={water - h(cn.documented_musd) - 36} textAnchor="middle" fontSize="9" className="fill-ink-3">China · to {cn.last_year}</text>
          <text x={115} y={water - h(cn.documented_musd) - 24} textAnchor="middle" fontSize="9" className="fill-ink-3">{cn.events.toLocaleString("en-US")} events, {cn.with_amount.toLocaleString("en-US")} with an amount</text>
          <rect x={220} y={water - h(us.documented_musd)} width={110} height={h(us.documented_musd)} fill="var(--us)" rx="3" />
          <text x={275} y={water - h(us.documented_musd) - 8} textAnchor="middle" fontSize="14" fontWeight="700" className="fill-ink">{bn(us.documented_musd)}</text>
          <text x={275} y={water - h(us.documented_musd) - 36} textAnchor="middle" fontSize="9" className="fill-ink-3">United States · to {us.last_year}</text>
          <text x={275} y={water - h(us.documented_musd) - 24} textAnchor="middle" fontSize="9" className="fill-ink-3">{us.events.toLocaleString("en-US")} events</text>
        </g>
        <line x1={20} y1={water} x2={W - 20} y2={water} stroke="var(--outline)" strokeWidth="2" />
        <text x={W - 20} y={water + 14} textAnchor="end" fontSize="9" className="fill-ink-3">waterline: what the index counts</text>
        <text x={20} y={water + 34} fontSize="11" fontWeight="700" className="fill-ink">BELOW · recorded, shown apart, not counted</text>
        <text x={20} y={water + 48} fontSize="9" className="fill-ink-3">dollar axis</text>
        <g>
          <rect x={60} y={water + 56} width={110} height={h(cn.undocumented_musd)} fill={`url(#${defs}-dots)`} stroke="var(--cn)" strokeWidth="1.2" rx="3" />
          <text x={115} y={water + 56 + h(cn.undocumented_musd) + 14} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{bn(cn.undocumented_musd)}</text>
          <text x={115} y={water + 56 + h(cn.undocumented_musd) + 26} textAnchor="middle" fontSize="9" className="fill-ink-3">lower-confidence amounts · {cn.undocumented_n} records</text>
          <rect x={220} y={water + 56} width={110} height={h(cn.swap_musd)} fill={`url(#${defs}-hatch)`} stroke="var(--cn)" strokeWidth="1.2" rx="3" />
          <text x={275} y={water + 56 + h(cn.swap_musd) + 14} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{bn(cn.swap_musd)}</text>
          <text x={275} y={water + 56 + h(cn.swap_musd) + 26} textAnchor="middle" fontSize="9" className="fill-ink-3">swap-line drawdowns · {cn.swap_n} records</text>
        </g>
        <line x1={380} y1={water + 30} x2={380} y2={320} stroke="var(--rule-2)" strokeDasharray="4 3" />
        <text x={395} y={water + 48} fontSize="9" className="fill-ink-3">count axis (events, not dollars)</text>
        <g>
          <rect x={400} y={water + 56} width={110} height={ch(noAmountAll)} fill="none" stroke="var(--ink)" strokeWidth="1.5" rx="3" />
          <text x={455} y={water + 56 + ch(noAmountAll) + 14} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{noAmountAll.toLocaleString("en-US")}</text>
          <text x={455} y={water + 56 + ch(noAmountAll) + 26} textAnchor="middle" fontSize="9" className="fill-ink-3">events with no documented amount</text>
          <text x={455} y={water + 56 + ch(noAmountAll) + 37} textAnchor="middle" fontSize="8" className="fill-ink-3">{cn.undocumented_n} lower-confidence · {cn.swap_n} swaps · {cn.no_amount_n} none at all</text>
          {unattributed !== null && (
            <>
              <rect x={540} y={water + 56} width={110} height={ch(unattributed)} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" rx="3" />
              <text x={595} y={water + 56 + ch(unattributed) + 14} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{unattributed.toLocaleString("en-US")}</text>
              <text x={595} y={water + 56 + ch(unattributed) + 26} textAnchor="middle" fontSize="9" className="fill-ink-3">events naming no recipient</text>
            </>
          )}
        </g>
      </svg>
    </WideFigure>
  );
}

export function Ch3Iceberg({ cn, us, allYearsCN, undocumentedTop, network, lastYearCN }: { cn: LedgerSide; us: LedgerSide; allYearsCN: LedgerSide; undocumentedTop: { iso3: string; musd: number }[]; network: QuantFile["network"] | null; lastYearCN: number | null }) {
  const pre2008 = allYearsCN.undocumented_musd - cn.undocumented_musd;
  const lenders = network?.top_lenders ?? [];
  const named = lenders.filter((l) => !isUnspecified(l));
  const unnamed = lenders.length - named.length;
  const namedCN = named.filter((l) => l.origin === "CN").length, namedUS = named.filter((l) => l.origin === "US").length;
  const swapLender = lenders.find(isSwapLender);
  return (
    <div className="space-y-6">
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit title="The Iceberg: two ledgers, never summed" layer="facts" sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations"]} ids={["flow_finance:origin:year:amount_musd", "flow_finance:undocumented_musd", "flow_finance:swap_musd", "flow_finance:n_events", "network:unattributed_events"]} explore={{ href: "/explore?view=money&span=all", label: "Open the money arcs" }} note="Documented commitments are drawn solid; the dotted block is money a source reported at lower confidence, the hatched block is central-bank swap drawdowns (emergency liquidity), the outlined blocks are counts. Each is a real record the index refuses to count; none is added to another.">
            <Iceberg cn={cn} us={us} unattributed={network?.unattributed_events ?? null} />
          </Exhibit>
        </div>
        <div className="space-y-4">
          <StepCard>
            <p><strong>The number everyone quotes.</strong> {fmtMusd(cn.documented_musd)} of documented Chinese commitments to the twelve countries since 2008, over {cn.events.toLocaleString("en-US")} events of which {cn.with_amount.toLocaleString("en-US")} carry a documented amount; the record ends in {lastYearCN ?? cn.last_year}. The United States: {fmtMusd(us.documented_musd)} over {us.events.toLocaleString("en-US")} DFC and EXIM items to {us.last_year}.</p>
          </StepCard>
          <StepCard>
            <p><strong>The money with a lower confidence.</strong> {fmtMusd(cn.undocumented_musd)} across {cn.undocumented_n} records since 2008{pre2008 > 0 ? `, and a further ${fmtMusd(pre2008)} in records before 2008` : ""}. Largest: {undocumentedTop.slice(0, 4).map((u) => `${COUNTRY_NAMES[u.iso3] ?? u.iso3} ${fmtMusd(u.musd)}`).join(", ")}.</p>
          </StepCard>
          <StepCard>
            <p><strong>The money that is not a loan for anything.</strong> {fmtMusd(cn.swap_musd)} of central-bank swap drawdowns in {cn.swap_n} records, almost all of it Argentina&apos;s central bank drawing on the People&apos;s Bank of China. The pipeline flags each as rescue lending and keeps it out of the finance component; Chapter 8 draws it beside the opening sentence.</p>
          </StepCard>
          <StepCard>
            <p><strong>And the money nobody can place.</strong> {(cn.no_amount_n + cn.undocumented_n + cn.swap_n).toLocaleString("en-US")} events carry no documented amount ({cn.no_amount_n.toLocaleString("en-US")} none at all){network?.unattributed_events ? `, and ${network.unattributed_events.toLocaleString("en-US")} name no recipient` : ""}. Opacity is itself the finding.</p>
          </StepCard>
        </div>
      </div>
      {lenders.length > 0 && (
        <Exhibit title={`Who lends: the ${lenders.length} largest lenders`} layer="facts" sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations"]} ids={["network:top_lenders"]} note={`Weighted degree is the sum of every recorded amount on the lender's links across the twelve countries, all years, swap drawdowns and lower-confidence amounts included, so it is not the documented ledger above the waterline${swapLender ? `: the ${swapLender.label} row is the central-bank swap drawdowns the iceberg shows apart, almost all Argentina's, drawn hatched here` : ""}. Degree is the number of lender–recipient links.${unnamed > 0 ? ` ${unnamed === 1 ? "One row is" : `${unnamed} rows are`} an unspecified Chinese government institution: a lender, not a named one.` : ""}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ul className="space-y-1.5 text-sm">
              {lenders.map((l) => {
                const max = Math.max(...lenders.map((x) => x.weighted_degree_musd));
                const color = l.origin === "US" ? "var(--us)" : "var(--cn)";
                return (
                  <li key={l.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="min-w-0">
                      <span className="block truncate">{l.label}</span>
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
      )}
    </div>
  );
}
