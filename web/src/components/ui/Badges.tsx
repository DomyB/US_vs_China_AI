import { EVIDENCE_LABEL, RELIABILITY_LABEL, STANCE_LABEL } from "@/lib/constants";
import type { Reliability } from "@/lib/types";

export function ReliabilityBadge({ value }: { value: Reliability }) {
  const style: Record<Reliability, string> = {
    official: "border-facts text-facts",
    independent_academic: "border-ink-2 text-ink-2",
    partisan: "border-interp text-interp border-dashed",
    state_media: "border-cn text-cn border-dotted",
    analysis: "border-model text-model border-dashed",
  };
  return (
    <span className={`inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style[value]}`} title="Source reliability rating">
      {RELIABILITY_LABEL[value]}
    </span>
  );
}

export type Layer = "facts" | "model" | "interpretation";

export function LayerLabel({ layer }: { layer: Layer }) {
  const spec = {
    facts: { text: "Facts · sourced data", cls: "border-facts text-facts", mark: "■" },
    model: { text: "Model output · index or forecast", cls: "border-model text-model border-dashed", mark: "◆" },
    interpretation: { text: "Interpretation · written analysis", cls: "border-interp text-interp border-dotted", mark: "✎" },
  }[layer];
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${spec.cls}`}>
      <span aria-hidden="true">{spec.mark}</span>
      {spec.text}
    </span>
  );
}

export function EvidenceBadge({ level }: { level: string }) {
  const cls = level === "documented" ? "border-facts text-facts" : level === "strongly_indicated" ? "border-model text-model border-dashed" : "border-ink-3 text-ink-3 border-dotted";
  return <span className={`inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>{EVIDENCE_LABEL[level] ?? level}</span>;
}

export function StanceBadge({ value, toward }: { value: number | null; toward: "US" | "CN" }) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-block rounded-sm border border-dashed border-rule px-1.5 py-0.5 text-[11px] text-ink-3" title={`Stance toward ${toward === "US" ? "the United States" : "China"}: not yet classified (Phase 3)`}>
        {toward} · not yet classified
      </span>
    );
  }
  const label = STANCE_LABEL[value] ?? String(value);
  const sign = value > 0 ? "+" : "";
  return (
    <span className="inline-block rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2" title={`Stance toward ${toward === "US" ? "the United States" : "China"}: ${label}`}>
      {toward} {sign}{value}
    </span>
  );
}

export function SampleTag() {
  return <span className="inline-block rounded-sm bg-sample/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sample">Sample</span>;
}

export function DataLayerTag({ layer }: { layer: "real" | "sample" | "none" | "facts_only" | undefined }) {
  if (layer === "real") return <span className="inline-block rounded-sm bg-facts/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-facts">Real data</span>;
  if (layer === "facts_only") return <span className="inline-block rounded-sm bg-facts/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-facts">Real records · unclassified</span>;
  if (layer === "none") return <span className="inline-block rounded-sm bg-surface-2 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">No data yet</span>;
  return <SampleTag />;
}
