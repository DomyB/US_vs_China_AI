"use client";

import { ACTOR_COLOR } from "@/lib/constants";
import { tally, type MeasureVerdict } from "@/lib/verdicts";

const WHO: Record<MeasureVerdict["favours"], string> = { CN: "China", US: "United States", neither: "neither", unknown: "no figure" };

/** The measures as a table of verdicts: who each favours in its latest year, the figures, and what keeps it from settling the question. */
export function VerdictTable({ verdicts }: { verdicts: MeasureVerdict[] }) {
  const t = tally(verdicts);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: ACTOR_COLOR.CN }} />{t.CN} measure{t.CN === 1 ? "" : "s"} favour China</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: ACTOR_COLOR.US }} />{t.US} favour{t.US === 1 ? "s" : ""} the United States</span>
        {t.open > 0 && <span className="text-ink-3">{t.open} open</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-ink-3"><th className="py-1 pr-3 font-semibold">Measure</th><th className="py-1 pr-3 font-semibold">Favours</th><th className="py-1 pr-3 font-semibold">What the record says</th><th className="py-1 font-semibold">What keeps it open</th></tr></thead>
          <tbody>
            {verdicts.map((v) => (
              <tr key={v.id} className="border-t border-rule-2 align-top">
                <td className="py-1.5 pr-3 font-semibold">{v.label}<span className="block text-[10px] font-normal uppercase tracking-wide text-ink-3">{v.layer === "model" ? "model output" : "facts"}{v.year ? ` · ${v.year}` : ""}</span></td>
                <td className="py-1.5 pr-3 font-semibold" style={{ color: v.favours === "CN" ? ACTOR_COLOR.CN : v.favours === "US" ? ACTOR_COLOR.US : undefined }}>{WHO[v.favours]}</td>
                <td className="py-1.5 pr-3">{v.statement}</td>
                <td className="py-1.5 text-ink-2">{v.caveat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
