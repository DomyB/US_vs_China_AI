import sourcesFile from "../../public/data/sources.json";
import type { SourcesFile, SourceEntry } from "./types";

export const SOURCES = sourcesFile as SourcesFile;

export function sourceNameMap(): Record<string, { name: string; url: string }> {
  const m: Record<string, { name: string; url: string }> = {};
  for (const s of SOURCES.sources) m[s.id] = { name: s.name, url: s.url };
  return m;
}

export function sourceById(id: string): SourceEntry | undefined {
  return SOURCES.sources.find((s) => s.id === id);
}

// --- the lazily fetched registry (the evidence drawer reads it on first open; the static import above is being retired)

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
