import { SourcesTable } from "@/components/sources/SourcesTable";
import { SOURCES } from "@/lib/sources";

export const metadata = { title: "Sources · US–China Critical Minerals Tracker" };

export default function SourcesPage() {
  const counts = { live: 0, moved: 0, dead: 0, uncertain: 0 } as Record<string, number>;
  for (const s of SOURCES.sources) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Sources</h1>
      <p className="max-w-3xl text-sm text-ink-2">
        Generated from the source registry (<code className="font-mono text-xs">pipeline/config/sources/*.yaml</code>) on {SOURCES.generated_on}. {SOURCES.sources.length} sources:
        {" "}{counts.live} live, {counts.moved} moved, {counts.dead} dead, {counts.uncertain} uncertain. Statuses with method &ldquo;search&rdquo; were established from search-engine results and GitHub or package-index mirrors; &ldquo;direct&rdquo; means an HTTP check from a pipeline run.
      </p>
      <SourcesTable sources={SOURCES.sources} />
    </div>
  );
}
