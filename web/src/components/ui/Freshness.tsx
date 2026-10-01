import type { Freshness as FreshnessT } from "@/lib/types";

export function Freshness({ f, sources }: { f: FreshnessT; sources?: Record<string, { name: string; url: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule pt-2 text-[11px] text-ink-3">
      <span>
        <span className="font-medium text-ink-2">Last updated</span> {f.last_updated}
      </span>
      <span>
        <span className="font-medium text-ink-2">Refresh</span> {f.schedule}
      </span>
      {f.source_ids.length > 0 && (
        <span>
          <span className="font-medium text-ink-2">Sources</span>{" "}
          {f.source_ids.map((id, i) => {
            const s = sources?.[id];
            return (
              <span key={id}>
                {i > 0 && ", "}
                {s ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {s.name}
                  </a>
                ) : (
                  <a href={`/sources#${id}`} className="underline">{id}</a>
                )}
              </span>
            );
          })}
        </span>
      )}
    </div>
  );
}
