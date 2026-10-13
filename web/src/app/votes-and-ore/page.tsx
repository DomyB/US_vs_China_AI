import { Suspense } from "react";
import { AlignmentView } from "@/components/alignment/AlignmentView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "The two halves of the influence index set against each other: the countries that vote with China at the UN are not the countries that sell it their ore. Two maps, a quadrant chart, the movers and every country's two lines, derived from the published index.";

export const metadata = { title: "Votes and ore · Strata", description, openGraph: { title: "Votes and ore · Strata", description, images: ["/og.png"] } };

export default function VotesAndOrePage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <AlignmentView />
    </Suspense>
  );
}
