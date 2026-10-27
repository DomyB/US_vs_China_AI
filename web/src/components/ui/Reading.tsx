import Link from "next/link";
import type { ReactNode } from "react";
import { LayerLabel } from "@/components/ui/Badges";

export type ReadingKind = "facts" | "model" | "interpretation";

/**
 * The context of a chart, read as question, chart, findings, answer. `asks` is the question the chart answers, set as a
 * lead line above it; `how` explains the marks and folds behind "How to read it" so the chart stays in view; `findings`
 * are two or three short, descriptive bullets that carry the chart's own numbers (facts or a model output, never a
 * judgement); `says` is what it tells us, set below with its own kind label, because a description of what is drawn is a
 * fact or a model output while a judgement about it is an interpretation. Any part may be left out, and a caller may
 * render the lead above the chart (`<Reading asks how />`) and the rest below (`<Reading findings says />`).
 */
export function Reading({ asks, how, findings, findingsKind = "facts", says, saysKind = "interpretation", compact = false }: { asks?: ReactNode; how?: ReactNode; findings?: ReactNode[]; findingsKind?: ReadingKind; says?: ReactNode; saysKind?: ReadingKind; compact?: boolean }) {
  const list = findings?.filter((f) => f !== null && f !== undefined && f !== false) ?? [];
  if (!asks && !how && !says && list.length === 0) return null;
  return (
    <div className={`reading ${compact ? "reading-compact" : ""}`}>
      {asks && <p className="reading-asks">{asks}</p>}
      {how && (
        <details className="reading-how">
          <summary>How to read it</summary>
          <p>{how}</p>
        </details>
      )}
      {list.length > 0 && (
        <div className="reading-findings">
          <span className="reading-label">Findings</span>
          <ul>
            {list.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <LayerLabel layer={findingsKind} />
        </div>
      )}
      {says && (
        <p className="reading-says">
          <span className="reading-label">What it tells us</span>
          <span className="reading-text">
            {says} <LayerLabel layer={saysKind} />
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * The context of a page, at its top: what the page is for, how to use it, and where to go next. Pages that open with a
 * cover or a hero keep their own opening and use this only where the reader lands without one.
 */
export function PageGuide({ purpose, read, next, children }: { purpose: ReactNode; read?: ReactNode; next?: { href: string; label: string }[]; children?: ReactNode }) {
  return (
    <aside className="page-guide" aria-label="How to use this page">
      <p className="page-guide-purpose">{purpose}</p>
      {read && <p className="page-guide-read">{read}</p>}
      {next && next.length > 0 && (
        <p className="page-guide-next">
          <span className="reading-label">Go on to</span>
          {next.map((n, i) => (
            <span key={n.href}>
              {i > 0 && " · "}
              <Link href={n.href} className="underline decoration-dotted">{n.label}</Link>
            </span>
          ))}
        </p>
      )}
      {children}
    </aside>
  );
}
