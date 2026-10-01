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
