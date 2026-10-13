import { Suspense } from "react";
import { WhatWeKnowView } from "@/components/knowledge/WhatWeKnowView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "What the record says measure by measure, what the literature on China, the United States and Latin America's minerals has argued, and where the two agree; the conclusion and the next topic.";

export const metadata = { title: "What do we know · Strata", description, openGraph: { title: "What do we know · Strata", description, images: ["/og.png"] } };

export default function WhatWeKnowPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <WhatWeKnowView />
    </Suspense>
  );
}
