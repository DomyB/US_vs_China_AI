import { Suspense } from "react";
import { StoryPage } from "@/components/story/StoryPage";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { YEAR_MIN, YEAR_MAX } from "@/lib/constants";

export const metadata = { title: "Said & Paid · US–China Critical Minerals Tracker", description: `What leaders said, what the money did: nine chapters of evidence on the competition between the United States and China for South America's critical minerals, ${YEAR_MIN}–${YEAR_MAX}.` };

export default function HomePage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <StoryPage />
    </Suspense>
  );
}
