import { Suspense } from "react";
import { IndexGeometryView } from "@/components/stepbystep/IndexGeometryView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "One country-year of the influence index followed from six raw measurements to a point, the composite as a direction, distances to other country-years, the two sub-indices as axes and the whole record folded to two.";

export const metadata = { title: "Data as geometry · Strata", description, openGraph: { title: "Data as geometry · Strata", description, images: ["/og.png"] } };

export default function IndexGeometryPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <IndexGeometryView />
    </Suspense>
  );
}
