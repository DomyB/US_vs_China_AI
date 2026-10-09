import { EVIDENCE_LABEL, RELIABILITY_LABEL, STANCE_LABEL } from "@/lib/constants";
import type { LayerSource, QuantModelStatus, Reliability, TextModelStatus } from "@/lib/types";

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
    model: { text: "Model output", cls: "border-model text-model border-dashed", mark: "◆" },
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

export function StanceBadge({ value, toward, coded = false }: { value: number | null; toward: "US" | "CN"; coded?: boolean }) {
  const actor = toward === "US" ? "the United States" : "China";
  if (value === null || value === undefined) {
    return coded ? (
      <span className="inline-block rounded-sm border border-dotted border-rule px-1.5 py-0.5 text-[11px] text-ink-3" title={`Stance toward ${actor}: not applicable, the record does not name ${actor}`}>
        {toward} · not applicable
      </span>
    ) : (
      <span className="inline-block rounded-sm border border-dashed border-rule px-1.5 py-0.5 text-[11px] text-ink-3" title={`Stance toward ${actor}: not yet classified`}>
        {toward} · not yet classified
      </span>
    );
  }
  const label = STANCE_LABEL[value] ?? String(value);
  const sign = value > 0 ? "+" : "";
  return (
    <span className="inline-block rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2" title={`Stance toward ${actor}: ${label}${coded ? " (model output)" : ""}`}>
      {toward} {sign}{value}
    </span>
  );
}

export function SampleTag() {
  return <span className="inline-block rounded-sm bg-sample/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sample">Sample</span>;
}

export function DataLayerTag({ layer }: { layer: LayerSource | undefined }) {
  if (layer === "real") return <span className="inline-block rounded-sm bg-facts/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-facts">Real data</span>;
  if (layer === "generated" || layer === "generated+human") return <span className="inline-block rounded-sm bg-interp/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-interp">{layer === "generated+human" ? "Generated + owner's text" : "Generated from indicators"}</span>;
  if (layer === "facts_only") return <span className="inline-block rounded-sm bg-facts/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-facts">Real records · unclassified</span>;
  if (layer === "none") return <span className="inline-block rounded-sm bg-surface-2 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">No data yet</span>;
  return <SampleTag />;
}

/** States how the text classifier behind stance, tone and narratives stands: an unvalidated zero-shot
 *  baseline, or validated against the hand-coded sample with the agreement statistic. */
export function ModelStatusTag({ status }: { status: TextModelStatus | null | undefined }) {
  if (!status || !status.method) return <SampleTag />;
  const text = status.validated && status.kappa_stance_pooled !== null
    ? `Validated · κ=${status.kappa_stance_pooled.toFixed(2)} on ${status.n_coded} coded`
    : status.method === "zero_shot"
      ? "Zero-shot baseline · not yet validated"
      : "Trained · not yet validated";
  const title = status.validated
    ? `${status.method} classifier (${status.model}), codebook ${status.codebook_version}; agreement and per-class metrics on the methodology page`
    : `${status.method} classifier (${status.model}), codebook ${status.codebook_version}; no hand-coded validation yet, treat as indicative`;
  return (
    <span className="inline-block rounded-sm border border-dashed border-model px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-model" title={title}>
      {text}
    </span>
  );
}

/** States how the Phase 4 quant outputs (index, concentration, say–do gap, flags, network) stand: computed from the
 *  sourced data with a method version, or sample. */
export function QuantStatusTag({ status }: { status: QuantModelStatus | null | undefined }) {
  if (!status || status.status !== "computed") return <SampleTag />;
  const title = `${status.label ?? "computed"}; data release ${status.inputs_release}, run ${status.run_id}; method and limits on the methodology page`;
  return (
    <span className="inline-block rounded-sm border border-dashed border-model px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-model" title={title}>
      Computed · method {status.method_version}
    </span>
  );
}
