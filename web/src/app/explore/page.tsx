import { Suspense } from "react";
import { MapPage } from "@/components/home/MapPage";
import { sourceNameMapOnServer } from "@/lib/sources.server";

export const metadata = { title: "The evidence room · US–China Critical Minerals Tracker", description: "The map: every country coloured by the influence index, money arcs and trade arcs to Washington and Beijing, and a drawer with the country's five tabs.", openGraph: { title: "The evidence room · US–China Critical Minerals Tracker", description: "The map: every country coloured by the influence index, money arcs and trade arcs to Washington and Beijing, and a drawer with the country's five tabs.", images: ["/og.png"] } };

export default function ExplorePage() {
  const names = sourceNameMapOnServer();
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-3">Loading…</div>}>
      <MapPage sourceNames={names} />
    </Suspense>
  );
}
