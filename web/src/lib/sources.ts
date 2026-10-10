import type { SourceEntry, SourcesFile } from "./types";

/**
 * The sources registry (web/public/data/sources.json, 158 KB) is not in any bundle: server components read it from disk
 * (sources.server.ts) and the client fetches it once, on the first evidence drawer (loadSources / useSources).
 */

export function sourceNameMap(registry: SourcesFile | null | undefined): Record<string, { name: string; url: string }> {
  const m: Record<string, { name: string; url: string }> = {};
  for (const s of registry?.sources ?? []) m[s.id] = { name: s.name, url: s.url };
  return m;
}

let pending: Promise<SourcesFile | null> | null = null;

/** The registry fetched once per page load, shared by every drawer; null when it cannot be fetched. */
export function loadSources(): Promise<SourcesFile | null> {
  if (!pending) {
    pending = fetch("/data/sources.json")
      .then((r) => (r.ok ? (r.json() as Promise<SourcesFile>) : null))
      .catch(() => null);
  }
  return pending;
}

export function sourceEntry(registry: SourcesFile | null | undefined, id: string): SourceEntry | undefined {
  return registry?.sources.find((s) => s.id === id);
}
