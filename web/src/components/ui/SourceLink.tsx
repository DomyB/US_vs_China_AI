import type { SourceRef } from "@/lib/types";
import { ReliabilityBadge, SampleTag } from "./Badges";

export function SourceLink({ source, compact = false }: { source: SourceRef; compact?: boolean }) {
  const external = source.url.startsWith("http");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
      <span className="text-ink-3">Source:</span>
      {external ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
          {source.name}
        </a>
      ) : (
        <span>{source.name}</span>
      )}
      {!compact && <ReliabilityBadge value={source.reliability} />}
      {source.sample && <SampleTag />}
    </span>
  );
}
