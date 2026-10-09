"use client";

import { useRealMeta } from "@/lib/useRealMeta";

/** The citation line of the footer: the data release the site was built from, linked to its GitHub release. */
export function ReleaseLine() {
  const real = useRealMeta();
  if (real === undefined) return <span className="block h-4" aria-hidden="true" />;
  if (!real) return <span>Sample data; no data release yet.</span>;
  const tag = real.quant_model?.inputs_release ?? null;
  return (
    <span>
      Cite as: US–China Critical Minerals Tracker, data release {tag ? <a href={`https://github.com/DomyB/US_vs_China_AI/releases/tag/${tag}`} className="underline">{tag}</a> : "pending"} (ingested {real.generated_on}).
    </span>
  );
}
