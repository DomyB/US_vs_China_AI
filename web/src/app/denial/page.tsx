import { Suspense } from "react";
import { DenialView } from "@/components/denial/DenialView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "The companion project's analysis: why China keeps its economic ground in Latin America while Washington talks louder, from 31 studies, 1,076 dated events, 29 findings, 20 country verdicts and the coded governments since 2001.";

export const metadata = { title: "Denial without Substitution · Strata", description, openGraph: { title: "Denial without Substitution · Strata", description, images: ["/og.png"] } };

export default function DenialPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <DenialView />
    </Suspense>
  );
}
