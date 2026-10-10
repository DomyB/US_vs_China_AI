import { Suspense } from "react";
import { ArchiveHub } from "@/components/archive/ArchiveHub";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Archive · US–China Critical Minerals Tracker", description: "Statements, methods, sources, case files and the flag registry: every record the site reads, kept whole.", openGraph: { title: "Archive · US–China Critical Minerals Tracker", description: "Statements, methods, sources, case files and the flag registry: every record the site reads, kept whole.", images: ["/og.png"] } };

export default function ArchivePage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <ArchiveHub />
    </Suspense>
  );
}
