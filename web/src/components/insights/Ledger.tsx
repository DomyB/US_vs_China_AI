"use client";

import { BLOC_SHORT } from "@/components/statements/blocs";
import { fmtMusd } from "@/lib/format";
import type { InsightRegion } from "@/lib/types";

/** Statements by bloc on the left, documented commitments by origin on the right, on one visual scale each. */
export function Ledger({ tm }: { tm: InsightRegion["talk_vs_money"] }) {
  const blocs = tm.by_bloc.slice(0, 6);
  const maxN = Math.max(1, ...blocs.map((b) => b.n));
  const money = [
    { key: "CN", label: `China, ${tm.finance.CN.years.join("–")}`, cls: "bg-cn", ...tm.finance.CN },
    { key: "US", label: `US DFC, ${tm.finance.US.years.join("–")}`, cls: "bg-us", ...tm.finance.US },
    { key: "US_after", label: `US DFC, ${tm.finance.US_after.years.join("–")}`, cls: "bg-us", ...tm.finance.US_after },
  ];
  const maxM = Math.max(1, ...money.map((m) => m.musd));
  const r = tm.ratios;
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="card px-3 py-2.5"><p className="eyebrow">Statements by US officials vs Chinese officials</p><p className="mt-0.5 text-xl font-semibold leading-tight">{blocs.find((b) => b.bloc === "United States")?.n ?? 0} <span className="text-ink-3">vs</span> {blocs.find((b) => b.bloc === "China")?.n ?? 0}</p><p className="text-[11px] text-ink-3">{r.statements_us_over_cn !== null ? `${r.statements_us_over_cn.toFixed(1)} US statements for every Chinese one` : "no Chinese statements"}</p></div>
        <div className="card px-3 py-2.5"><p className="eyebrow">Documented commitments {tm.finance.CN.years.join("–")}</p><p className="mt-0.5 text-xl font-semibold leading-tight"><span className="text-cn">{fmtMusd(tm.finance.CN.musd)}</span> <span className="text-ink-3">vs</span> <span className="text-us">{fmtMusd(tm.finance.US.musd)}</span></p><p className="text-[11px] text-ink-3">{r.money_cn_over_us_2015_21 !== null ? `${r.money_cn_over_us_2015_21.toFixed(1)} Chinese dollars for every American one` : "no US commitments in the window"}</p></div>
        <div className="card px-3 py-2.5"><p className="eyebrow">Tagged to a mineral by the adapters</p><p className="mt-0.5 text-xl font-semibold leading-tight"><span className="text-cn">{fmtMusd(tm.finance.CN.mineral_tagged_musd)}</span> <span className="text-ink-3">vs</span> <span className="text-us">{fmtMusd(tm.finance.US.mineral_tagged_musd + tm.finance.US_after.mineral_tagged_musd)}</span></p><p className="text-[11px] text-ink-3">the rest went to rail, power, budgets and other sectors</p></div>
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink">Who talks: statements by speaker bloc</p>
          <ul className="space-y-1.5">
            {blocs.map((b) => (
              <li key={b.bloc} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                <span className="truncate text-ink-2" title={b.bloc}>{BLOC_SHORT[b.bloc] ?? b.bloc}</span>
                <span className="ledger-track"><span className={`ledger-fill ${b.bloc === "United States" ? "bg-us" : b.bloc === "China" ? "bg-cn" : "bg-other"}`} style={{ width: `${(100 * b.n) / maxN}%` }} /></span>
                <span className="text-right tabular-nums">{b.n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink">Who pays: documented commitments by origin (darker part: tagged to a mineral)</p>
          <ul className="space-y-1.5">
            {money.map((m) => (
              <li key={m.key} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-xs">
                <span className="truncate text-ink-2">{m.label}</span>
                <span className="ledger-track">
                  <span className={`ledger-fill ${m.cls}`} style={{ width: `${(100 * m.musd) / maxM}%`, opacity: 0.45 }} />
                  <span className={`ledger-fill ${m.cls}`} style={{ width: `${(100 * m.mineral_tagged_musd) / maxM}%` }} />
                </span>
                <span className="text-right tabular-nums">{fmtMusd(m.musd)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">{tm.note}. Statement counts come from the owner&apos;s dataset (in-scope countries and region-wide records); the money is the sum of documented commitments in the de-duplicated finance events (AidData for China, the DFC for the United States), swap-line drawdowns excluded.</p>
    </div>
  );
}
