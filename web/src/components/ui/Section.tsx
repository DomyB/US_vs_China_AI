import type { ReactNode } from "react";

/** Title row of a panel block: title on the left, layer tags on the right, an optional one-line intro. */
export function SectionHeader({ id, title, tags, intro }: { id: string; title: ReactNode; tags?: ReactNode; intro?: ReactNode }) {
  return (
    <div className="mb-1">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 id={id} className="text-[0.9rem] font-semibold leading-snug">{title}</h3>
        {tags && <span className="flex shrink-0 flex-wrap items-center gap-1">{tags}</span>}
      </div>
      {intro && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{intro}</p>}
    </div>
  );
}

/** A note about method or status: one line visible, the rest behind a toggle; tinted by layer. */
export function Callout({ tone = "model", summary, children }: { tone?: "model" | "interp" | "facts" | "sample"; summary: ReactNode; children?: ReactNode }) {
  const cls = { model: "border-model/30 bg-model/5 text-model", interp: "border-interp/30 bg-interp/5 text-interp", facts: "border-facts/30 bg-facts/5 text-facts", sample: "border-sample/40 bg-sample/10 text-sample" }[tone];
  if (!children) {
    return <p className={`rounded-md border px-2.5 py-1.5 text-xs leading-relaxed ${cls}`}>{summary}</p>;
  }
  return (
    <details className={`rounded-md border px-2.5 py-1.5 text-xs ${cls}`}>
      <summary className="!text-inherit">{summary} <span className="underline decoration-dotted opacity-80">details</span></summary>
      <div className="mt-1 leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}

/** A headline number with its label and an optional note; the number uses proportional figures. */
export function StatTile({ label, value, note, href }: { label: string; value: ReactNode; note?: ReactNode; href?: string }) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 text-lg font-semibold leading-tight text-ink sm:text-xl">{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{note}</p>}
    </>
  );
  return href ? (
    <a href={href} className="card block px-3 py-2.5 no-underline">{body}</a>
  ) : (
    <div className="card px-3 py-2.5">{body}</div>
  );
}
