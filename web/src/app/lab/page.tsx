import { Suspense } from "react";
import { InsightsView } from "@/components/insights/InsightsView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "The Lab · Strata", description: "The 2030 board, a scenario studio with five levers, the contrasts between words and money, and the findings with their evidence meters. Your scenario is labelled as yours, never as a forecast.", openGraph: { title: "The Lab · Strata", description: "The 2030 board, a scenario studio with five levers, the contrasts between words and money, and the findings with their evidence meters. Your scenario is labelled as yours, never as a forecast.", images: ["/og.png"] } };

export default function LabPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <InsightsView />
    </Suspense>
  );
}
