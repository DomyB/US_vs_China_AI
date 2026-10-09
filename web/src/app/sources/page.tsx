import { SourcesTable } from "@/components/sources/SourcesTable";
import { StatTile } from "@/components/ui/Section";
import { SOURCES } from "@/lib/sources";

export const metadata = { title: "Sources · US–China Critical Minerals Tracker" };

export default function SourcesPage() {
  const counts = { live: 0, moved: 0, dead: 0, uncertain: 0 } as Record<string, number>;
  for (const s of SOURCES.sources) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold sm:text-[1.75rem]">Sources</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Generated from the source registry (<code className="rounded bg-surface-2 px-1 font-mono text-xs">pipeline/config/sources/*.yaml</code>); every URL is tested each week from a GitHub Actions runner, last on {SOURCES.generated_on}. Statuses with method &ldquo;search&rdquo; were established from search-engine results and package-index mirrors. &ldquo;Blocks automated clients&rdquo; means the site answered 403 to a generic client (bot protection), not that it is down.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[30rem]">
          <StatTile label="Registered" value={SOURCES.sources.length} note="all scopes and categories" />
          <StatTile label="Live" value={counts.live} note="registry status" />
          <StatTile label="Moved" value={counts.moved} note="replacement recorded" />
          <StatTile label="Dead or uncertain" value={counts.dead + counts.uncertain} note="listed, not used" />
        </div>
      </div>
      <SourcesTable sources={SOURCES.sources} />
    </div>
  );
}
