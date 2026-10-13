import { Suspense } from "react";
import { ClassifierView } from "@/components/stepbystep/ClassifierView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "The pipeline's stance head trained in the browser on real records: one layer of weights, the forward pass, the loss, the gradient, gradient descent and the decision, every number recomputed on the page.";

export const metadata = { title: "A classifier, step by step · US–China Critical Minerals Tracker", description, openGraph: { title: "A classifier, step by step · US–China Critical Minerals Tracker", description, images: ["/og.png"] } };

export default function ClassifierPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <ClassifierView />
    </Suspense>
  );
}
