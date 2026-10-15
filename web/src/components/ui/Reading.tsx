import Link from "next/link";
import type { ReactNode } from "react";
import { LayerLabel } from "@/components/ui/Badges";

export type ReadingKind = "facts" | "model" | "interpretation";

/**
 * The context of a chart, in three short lines: the question it answers (why this chart and not another), how to read
 * its marks, and what it tells us. The last line carries its own kind label, because a description of what is drawn is
 * a fact or a model output while a judgement about it is an interpretation; the writer chooses, and the default is the
 * careful one. Any of the three may be left out.
 */
export function Reading({ asks, how, says, saysKind = "interpretation", compact = false }: { asks?: ReactNode; how?: ReactNode; says?: ReactNode; saysKind?: ReadingKind; compact?: boolean }) {
  if (!asks && !how && !says) return null;
  return (
    <dl className={`reading ${compact ? "reading-compact" : ""}`}>
      {asks && (
        <div className="reading-row">
          <dt>Why this chart</dt>
          <dd>{asks}</dd>
        </div>
      )}
      {how && (
        <div className="reading-row">
          <dt>How to read it</dt>
          <dd>{how}</dd>
        </div>
      )}
      {says && (
        <div className="reading-row reading-says">
          <dt>What it tells us</dt>
          <dd>
            {says} <LayerLabel layer={saysKind} />
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The context of a page, at its top: what the page is for, how to use it, and where to go next. Pages that open with a
 * cover or a hero keep their own opening and use this only where the reader lands without one.
 */
export function PageGuide({ purpose, read, next, children }: { purpose: ReactNode; read?: ReactNode; next?: { href: string; label: string }[]; children?: ReactNode }) {
  return (
    <aside className="page-guide" aria-label="How to use this page">
      <dl className="reading reading-compact">
      <div className="reading-row">
        <dt>This page</dt>
        <dd>{purpose}</dd>
      </div>
      {read && (
        <div className="reading-row">
          <dt>How to use it</dt>
          <dd>{read}</dd>
        </div>
      )}
      {next && next.length > 0 && (
        <div className="reading-row">
          <dt>Go on to</dt>
          <dd>
            {next.map((n, i) => (
              <span key={n.href}>
                {i > 0 && " · "}
                <Link href={n.href} className="underline decoration-dotted">{n.label}</Link>
              </span>
            ))}
          </dd>
        </div>
      )}
      </dl>
      {children}
    </aside>
  );
}
