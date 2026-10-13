import Link from "next/link";
import { LayerLabel } from "@/components/ui/Badges";

const description = "Three walkthroughs over the tracker's own records: how a headline becomes a point in a space where distance is meaning, how a country-year of the influence index becomes a point whose composite is a direction, and how the stance classifier learns from examples. Every stage is a live view of real data.";

export const metadata = { title: "Step by step · US–China Critical Minerals Tracker", description, openGraph: { title: "Step by step · US–China Critical Minerals Tracker", description, images: ["/og.png"] } };

const PAGES = [
  { href: "/step-by-step/words", n: 1, title: "From words to geometry", lead: "One real headline or bill followed from its title to its vector, its nearest records in four languages, the fold to two dimensions and the map of every embedded record.", ready: true },
  { href: "/step-by-step/index-geometry", n: 2, title: "Data as geometry", lead: "One country-year of the influence index followed from six raw measurements to a point, the composite as a direction, distances to other country-years, the two sub-indices as axes and the whole record folded to two.", ready: true },
  { href: "/step-by-step/classifier", n: 3, title: "A classifier, step by step", lead: "The pipeline's stance head trained in your browser: one layer of weights, the forward pass on a real record, the loss, the gradient, four hundred steps of descent and the decision it reaches.", ready: true },
  { href: "", n: 4, title: "The money as a network", lead: "The finance and trade records as a graph of countries, lenders and projects: degree, paths and communities on the real ledger.", ready: false },
  { href: "", n: 5, title: "Reading the same text twice", lead: "The hand-coded validation sample against the model's labels: agreement, where the two disagree and what that means for the stance figures.", ready: false },
];

export default function StepByStepIndex() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <p className="eyebrow">Step by step</p>
      <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">The methods, one record at a time</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">The rest of the site shows what the records say. These pages show how the computed layers are made, by following one real record through every step and letting you change the record. Nothing here is a textbook example: the titles, the component values and the distances are the release&apos;s own, recomputed in your browser so each number can be checked against the published one.</p>
      <div className="mt-3"><LayerLabel layer="model" /></div>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        {PAGES.map((p) => (
          <li key={p.n} className={`card px-4 py-4 ${p.ready ? "" : "opacity-70"}`}>
            <p className="eyebrow">Page {p.n}{p.ready ? "" : " · planned"}</p>
            <h2 className="serif mt-0.5 text-lg font-bold leading-tight">{p.ready ? <Link href={p.href} className="hover:underline">{p.title}</Link> : p.title}</h2>
            <p className="mt-1.5 text-sm text-ink-2">{p.lead}</p>
            {p.ready && <p className="mt-2"><Link href={p.href} className="btn btn-sm">Start the walk</Link></p>}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-ink-3">Pages 4 and 5 wait on records that are not yet in the release: the network needs the finance graph export and the second reading needs the owner&apos;s coded validation sample.</p>
    </div>
  );
}
