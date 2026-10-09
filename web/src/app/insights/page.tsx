import { Suspense } from "react";
import { InsightsView } from "@/components/insights/InsightsView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Insights and scenarios · US–China Critical Minerals Tracker", description: "What governments say against what the money and the minerals do, and scenarios to 2030 driven by the reader's own choices." };

export default function InsightsPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <InsightsView />
    </Suspense>
  );
}
