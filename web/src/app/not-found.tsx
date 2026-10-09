import Link from "next/link";
import { HeroArt } from "@/components/ui/HeroArt";
import { COUNTRY_NAMES, IN_SCOPE } from "@/lib/constants";

/** The 404 page: says what is missing and offers the twelve country pages and the two ways back. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="card grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
        <div>
          <p className="eyebrow">Error 404</p>
          <h1 className="mt-1 text-2xl sm:text-[1.75rem]">No such page</h1>
          <p className="mt-2 text-sm text-ink-2">The address does not match a page of the tracker. The country pages are:</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {IN_SCOPE.map((iso3) => (
              <li key={iso3}>
                <Link href={`/country/${iso3}`} className="pill pill-sm">{COUNTRY_NAMES[iso3] ?? iso3}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/" className="btn btn-md btn-primary">Back to the map</Link>
            <Link href="/sources" className="btn btn-md">Sources</Link>
          </div>
        </div>
        <HeroArt className="mx-auto hidden w-52 sm:block" />
      </div>
    </div>
  );
}
