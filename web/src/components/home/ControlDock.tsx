"use client";

import type { ReactNode } from "react";
import type { MapView } from "./ContextBar";
import type { FlowsFile } from "@/lib/types";

interface Props {
  view: MapView;
  flowsMeta?: FlowsFile["meta"] | null;
  flowsLayer?: "real" | "sample" | null;
  legend: ReactNode;
  /** on a phone the legend folds behind a summary */
  compact?: boolean;
}

function flowNote(view: MapView, m: FlowsFile["meta"] | null | undefined, layer: "real" | "sample" | null | undefined): string | null {
  if (view === "index" || !m) return null;
  const ly = m.last_year;
  const base = view === "money"
    ? `Money: documented commitments from AidData (China, to ${ly.finance_CN ?? "–"}) and the DFC and EXIM (United States, to ${ly.finance_US ?? "–"}); events without a published amount are counted but add no width; swap lines and lower-confidence records are listed apart.`
    : view === "trade"
      ? `Trade: reported exports to each actor (UN Comtrade, to ${ly.trade ?? "–"}); mirror data is not used.`
      : `Who buys: each country's own reported exports (UN Comtrade, to ${ly.trade ?? "–"}); a country without a China cell, a US cell and a world total in the year stays grey.`;
  return layer === "sample" ? `${base} SAMPLE flows until the first data run.` : base;
}

/** The legend card on the map; the controls live in the context bar above the map. */
export function ControlDock(p: Props) {
  const note = flowNote(p.view, p.flowsMeta, p.flowsLayer);
  if (p.compact) {
    return (
      <details className="card px-2 py-1 text-xs">
        <summary className="cursor-pointer text-xs font-medium text-ink-2">Legend</summary>
        <div className="mt-2 max-w-[18rem] space-y-2">
          {p.legend}
          {note && <p className="text-[11px] leading-snug text-ink-3">{note}</p>}
        </div>
      </details>
    );
  }
  return (
    <div className="card w-[17rem] p-3">
      {p.legend}
      {note && <p className="mt-2 border-t border-rule pt-2 text-[11px] leading-snug text-ink-3">{note}</p>}
    </div>
  );
}
