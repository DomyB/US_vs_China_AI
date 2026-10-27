import { Suspense } from "react";
import { ContestedMoreView } from "@/components/contested/ContestedMoreView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { countWord } from "@/lib/constants";
import { MAIN_CLAIMS, MORE_CLAIMS } from "@/lib/contested";

const description = `${countWord(MORE_CLAIMS.length, true)} further claims about the US–China rivalry over Latin America's minerals, tested on the site's own record the same way as the ${countWord(MAIN_CLAIMS.length)} main ones: weaker, more technical, robustness checks or open, each with its test, findings, record and a verdict by a stated rule.`;

export const metadata = { title: "Further claims · Strata", description, openGraph: { title: "Further claims · Strata", description, images: ["/og.png"] } };

export default function ContestedMorePage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <ContestedMoreView />
    </Suspense>
  );
}
