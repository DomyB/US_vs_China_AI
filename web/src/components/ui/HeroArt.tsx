/** Illustrated South America with three mineral crystals and the two actors' routes. Decorative; every colour is a
 *  CSS variable so the drawing follows the colour scheme. The Andes triangles sit inside the land polygon by construction. */
export function HeroArt({ className = "" }: { className?: string }) {
  const land = "M92 22 L124 14 L152 28 L176 52 L188 78 L170 104 L146 124 L124 152 L114 176 L100 176 L94 150 L86 118 L78 94 L60 70 L62 46 L76 28 Z";
  return (
    <svg viewBox="0 0 240 190" className={className} role="img" aria-label="Illustration: South America with mineral crystals and routes from the United States and China">
      <ellipse cx="124" cy="100" rx="98" ry="86" fill="var(--sea)" />
      <path d={land} fill="var(--land)" stroke="var(--outline)" strokeWidth="3" strokeLinejoin="round" />
      <g fill="var(--land-2)" stroke="var(--outline)" strokeWidth="2" strokeLinejoin="round">
        <path d="M70 60 l9 -14 l9 14 z" /><path d="M80 90 l9 -14 l9 14 z" /><path d="M90 122 l9 -14 l9 14 z" /><path d="M100 150 l8 -12 l8 12 z" />
      </g>
      <g strokeWidth="2.2" strokeLinejoin="round">
        <path d="M150 54 l10 -12 l10 12 l-4 20 l-12 0 z" fill="var(--cn)" stroke="var(--outline)" /><path d="M160 42 l0 32 M150 54 l20 0" className="hero-shine" stroke="var(--shine)" strokeOpacity="0.55" />
        <path d="M118 96 l10 -12 l10 12 l-4 20 l-12 0 z" fill="var(--us)" stroke="var(--outline)" /><path d="M128 84 l0 32 M118 96 l20 0" className="hero-shine" stroke="var(--shine)" strokeOpacity="0.55" />
        <path d="M136 130 l8 -10 l8 10 l-3 16 l-10 0 z" fill="var(--other)" stroke="var(--outline)" /><path d="M144 120 l0 26" className="hero-shine" stroke="var(--shine)" strokeOpacity="0.55" />
      </g>
      <path className="hero-route" d="M30 24 C 60 10, 100 30, 124 86" fill="none" stroke="var(--us)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
      <path className="hero-route" d="M214 22 C 196 36, 178 40, 162 52" fill="none" stroke="var(--cn)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
      <g fontFamily="var(--font-sans)" fontSize="11" fontWeight="700" textAnchor="middle">
        <circle cx="24" cy="26" r="13" fill="var(--card)" stroke="var(--us)" strokeWidth="2.5" /><text x="24" y="30" fill="var(--us)">US</text>
        <circle cx="218" cy="22" r="13" fill="var(--card)" stroke="var(--cn)" strokeWidth="2.5" /><text x="218" y="26" fill="var(--cn)">CN</text>
      </g>
    </svg>
  );
}
