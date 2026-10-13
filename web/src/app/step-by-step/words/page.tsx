import { Suspense } from "react";
import { WordsView } from "@/components/stepbystep/WordsView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "One real headline or bill followed from its title to its vector, its nearest records, the fold to two dimensions and the map of every embedded record in the corpus.";

export const metadata = { title: "From words to geometry · US–China Critical Minerals Tracker", description, openGraph: { title: "From words to geometry · US–China Critical Minerals Tracker", description, images: ["/og.png"] } };

export default function WordsPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <WordsView />
    </Suspense>
  );
}
