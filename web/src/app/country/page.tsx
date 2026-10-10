import { Suspense } from "react";
import { CaseFilesIndex } from "@/components/archive/CaseFilesIndex";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Case files · US–China Critical Minerals Tracker", description: "The twelve country files: actions, words, press, analysis and forecast, each number with its source." };

export default function CaseFilesPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <CaseFilesIndex />
    </Suspense>
  );
}
