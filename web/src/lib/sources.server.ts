import { readFileSync } from "node:fs";
import path from "node:path";
import type { SourcesFile } from "./types";

let cached: SourcesFile | null = null;

/** The sources registry read from disk at build time, for server components that need names when they render. */
export function sourcesOnServer(): SourcesFile {
  if (!cached) {
    cached = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/sources.json"), "utf8")) as SourcesFile;
  }
  return cached;
}

export function sourceNameMapOnServer(): Record<string, { name: string; url: string }> {
  const m: Record<string, { name: string; url: string }> = {};
  for (const s of sourcesOnServer().sources) m[s.id] = { name: s.name, url: s.url };
  return m;
}
