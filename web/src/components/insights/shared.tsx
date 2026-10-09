"use client";

import type { ReactNode } from "react";
import { DataLayerTag, LayerLabel, type Layer } from "@/components/ui/Badges";
import { ACTOR_COLOR, OTHER_COLOR } from "@/lib/constants";
import type { EvidenceLevel } from "@/lib/types";

export const INK = "#1b1d20";
export const INK_3 = "#9a9fa8";
export const RULE = "#c9c7c0";
export const CAT_3 = "#6a4fb8";
export const CAT_4 = "#1d8f6e";
export const COLORS = { US: ACTOR_COLOR.US, CN: ACTOR_COLOR.CN, OTHER: OTHER_COLOR };
export const pretty = (m: string) => m.replace(/_/g, " ");
export const fmtPts = (v: number, digits = 1) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)} pts`;

/** A page block: numbered eyebrow, big title, one-line lead, layer tags on the right. */
export function Block({ id, n, title, lead, layer, tags, children }: { id: string; n: number; title: ReactNode; lead?: ReactNode; layer: Layer; tags?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} data-tour={id} className="insights-block card mt-6 px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="eyebrow">{String(n).padStart(2, "0")}</p>
          <h2 id={`${id}-h`} className="serif mt-0.5 text-xl font-bold leading-tight sm:text-2xl">{title}</h2>
          {lead && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">{lead}</p>}
        </div>
        <span className="flex max-w-full flex-wrap items-center gap-1"><DataLayerTag layer="real" /><LayerLabel layer={layer} />{tags}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Three bars, filled by evidence level, with the basis on hover and as text. */
export function EvidenceMeter({ level, basis }: { level: EvidenceLevel; basis: string }) {
  const n = level === "strong" ? 3 : level === "moderate" ? 2 : 1;
  const word = { strong: "strong evidence", moderate: "moderate evidence", thin: "thin evidence" }[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3" title={basis}>
      <span className="evidence" aria-hidden="true" data-level={level}>{[1, 2, 3].map((i) => <span key={i} className={i <= n ? "on" : ""} />)}</span>
      <span className="sr-only">{word}: </span>{word}
    </span>
  );
}

/** A labelled lever: title, value readout and the control. */
export function Lever({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border-2 border-outline bg-card px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink">{label}</span>
        <span className="text-xs tabular-nums text-ink-2">{value}</span>
      </div>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-ink-3">{hint}</p>}
    </div>
  );
}
