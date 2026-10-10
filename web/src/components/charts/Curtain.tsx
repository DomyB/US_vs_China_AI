/**
 * The curtain: the reusable "no source after <year>" transition. A flat grey hatch over the years a source does not
 * reach, with a dashed edge where the record ends and the reason written on it. The SVG pair (CurtainDefs + Curtain)
 * is for hand-drawn exhibits; CurtainBox is the HTML variant a caller places over a Plot figure.
 */

export const CURTAIN_PATTERN = "curtain-hatch";

/** The hatch pattern; mount once per SVG, with a prefix when several SVGs share a page. */
export function CurtainDefs({ prefix = "" }: { prefix?: string }) {
  const id = `${prefix}${CURTAIN_PATTERN}`;
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--surface-2)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeWidth="1" strokeOpacity="0.45" />
      </pattern>
    </defs>
  );
}

export function Curtain({ x, y, width, height, label, prefix = "", vertical }: { x: number; y: number; width: number; height: number; label: string; prefix?: string; vertical?: boolean }) {
  const id = `${prefix}${CURTAIN_PATTERN}`;
  const upright = vertical ?? height > width;
  return (
    <g className="curtain" aria-label={label} role="img">
      <rect x={x} y={y} width={width} height={height} fill={`url(#${id})`} />
      <line x1={x} y1={y} x2={x} y2={y + height} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 2" />
      {upright ? (
        <text x={x + width / 2} y={y + height / 2} fontSize="9" fill="var(--ink-2)" textAnchor="middle" transform={`rotate(-90 ${x + width / 2} ${y + height / 2})`}>{label}</text>
      ) : (
        <text x={x + 4} y={y + 11} fontSize="9" fill="var(--ink-2)">{label}</text>
      )}
    </g>
  );
}

/** The HTML variant: an absolutely positioned box the caller sizes over a figure (left and width in %). */
export function CurtainBox({ left, width, label }: { left: string; width: string; label: string }) {
  return (
    <div className="curtain-box" style={{ left, width }} role="img" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}
