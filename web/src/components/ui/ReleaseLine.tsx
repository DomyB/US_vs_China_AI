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
      Cite as: Strata, China, the United States and Latin America&apos;s critical minerals, data release {tag ? <a href={`https://github.com/DomyB/US_vs_China_AI/releases/tag/${tag}`} className="underline">{tag}</a> : "pending"} (ingested {real.generated_on}
      {real.sources_live ? `; ${real.sources_live.live} of ${real.sources_live.total} sources live` : ""}
      {real.adapters_ok ? `; ${real.adapters_ok.ok} of ${real.adapters_ok.total} adapters ran` : ""}).
    </span>
  );
}
