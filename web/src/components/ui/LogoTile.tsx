/** The site mark: a 2×2 sticker tile with the two actors' hues on opposite corners. */
export function LogoTile({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`sticker grid shrink-0 grid-cols-2 overflow-hidden rounded-lg bg-card ${className}`} style={{ width: size, height: size }}>
      <span className="bg-us" />
      <span className="bg-surface-2" />
      <span className="bg-surface-2" />
      <span className="bg-cn" />
    </span>
  );
}
