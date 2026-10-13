import { Suspense } from "react";
import { MineralView } from "@/components/mineral/MineralView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pretty = id.replace(/_/g, " ");
  return { title: `${pretty[0]?.toUpperCase() ?? ""}${pretty.slice(1)} · Strata`, description: `The ${pretty} case file: why it matters, who produces it, who buys it, where it is and what it costs.` };
}

export default async function MineralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <MineralView id={id} />
    </Suspense>
  );
}
