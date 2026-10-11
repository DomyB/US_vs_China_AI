import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import { ArchiveHub, type ArchiveDownload } from "@/components/archive/ArchiveHub";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Archive · US–China Critical Minerals Tracker", description: "Statements, methods, sources, case files and the flag registry: every record the site reads, kept whole.", openGraph: { title: "Archive · US–China Critical Minerals Tracker", description: "Statements, methods, sources, case files and the flag registry: every record the site reads, kept whole.", images: ["/og.png"] } };

/**
 * The exports no page draws but the pipeline publishes for download (DECISIONS: the counts live in insights.json and
 * meta.json; the records themselves are here). Size and row count are read from the files when the page is built, so
 * nothing here is typed; a file absent from the checkout is listed as not in this release.
 */
const DOWNLOADS: { file: string; key: string; description: string }[] = [
  { file: "policy.json", key: "documents", description: "US policy documents selected by title: Congress.gov bills and Federal Register notices and rules, each with title, agency, date, topics and the source URL. The documents the Attention block and chapter 1 count by year." },
  { file: "prices.json", key: "series", description: "World price rows per mineral: the World Bank Pink Sheet monthly series and USGS Mineral Commodity Summaries annual averages, each with unit, date and the source URL. The series behind chapter 2's price strip and the Lab's price lever, there as annual averages." },
];

function describe(d: (typeof DOWNLOADS)[number]): ArchiveDownload {
  try {
    const p = path.join(process.cwd(), "public/data/real", d.file);
    if (!existsSync(p)) return { file: d.file, href: `/data/real/${d.file}`, bytes: null, rows: null, description: d.description };
    const bytes = statSync(p).size;
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const rows = Array.isArray(parsed[d.key]) ? (parsed[d.key] as unknown[]).length : null;
    return { file: d.file, href: `/data/real/${d.file}`, bytes, rows, description: d.description };
  } catch {
    return { file: d.file, href: `/data/real/${d.file}`, bytes: null, rows: null, description: d.description };
  }
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <ArchiveHub downloads={DOWNLOADS.map(describe)} />
    </Suspense>
  );
}
