import { Suspense } from "react";
import { StageView } from "@/components/stage/StageView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "The team's prototype as a section of Strata: the research question, four numbers from the team's own BACI and Comtrade panel over 33 ECLAC states, the story in five acts, baskets and stages with every destination, the three-lane timeline, the commitment ladder, the sixteen pressure cases and the hypothesis cards.";

export const metadata = { title: "Two powers, one stage · Strata", description, openGraph: { title: "Two powers, one stage · Strata", description, images: ["/og.png"] } };

export default function StagePage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <StageView />
    </Suspense>
  );
}
