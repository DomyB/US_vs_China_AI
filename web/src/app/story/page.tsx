import { Suspense } from "react";
import { StoryPage } from "@/components/story/StoryPage";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { YEAR_MIN, YEAR_MAX } from "@/lib/constants";

const DESCRIPTION = `What leaders said, what the money did: the whole picture, nine chapters of evidence and a verdict on the competition between the United States and China for Latin America's critical minerals, ${YEAR_MIN}–${YEAR_MAX}.`;

export const metadata = { title: "Said & Paid · Strata", description: DESCRIPTION, openGraph: { title: "Said & Paid · Strata", description: DESCRIPTION, images: ["/og.png"] } };

export default function StoryRoute() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <StoryPage />
    </Suspense>
  );
}
