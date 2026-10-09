import { Suspense } from "react";
import { CountrySkeleton } from "@/components/ui/Skeleton";
import { notFound } from "next/navigation";
import { CountryPage } from "@/components/country/CountryPage";
import { COUNTRY_NAMES, IN_SCOPE } from "@/lib/constants";
import { sourceNameMap } from "@/lib/sources";

export function generateStaticParams() {
  return IN_SCOPE.map((iso3) => ({ iso3 }));
}

export async function generateMetadata({ params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  return { title: `${COUNTRY_NAMES[iso3] ?? iso3} · US–China Critical Minerals Tracker` };
}

export default async function Page({ params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  if (!IN_SCOPE.includes(iso3)) notFound();
  return (
    <Suspense fallback={<CountrySkeleton />}>
      <CountryPage iso3={iso3} sourceNames={sourceNameMap()} />
    </Suspense>
  );
}
