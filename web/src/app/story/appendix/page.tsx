import { Suspense } from "react";
import { StoryAppendix } from "@/components/story/StoryAppendix";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "The technical exhibits behind the story's chapters: the coverage wall and the chapter meters, the lender ranking, the parity arithmetic for Chile and for every country, Argentina's influence index and its trajectory, and the reconciled trade that bounds the indirect route to the United States.";

export const metadata = { title: "Story appendix · Strata", description, openGraph: { title: "Story appendix · Strata", description, images: ["/og.png"] } };

export default function StoryAppendixRoute() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <StoryAppendix />
    </Suspense>
  );
}
