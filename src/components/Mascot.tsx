/**
 * Blip — Peak's weird-cute mascot. A small original SVG: a hot-light-blue
 * blob with oversized eyes and tiny butter-yellow sneakers. Lightweight
 * (single inline SVG, no assets), used only for onboarding, empty states,
 * and celebration moments — never obstructing content.
 */
export default function Mascot({
  mood = 'happy',
  className = '',
}: {
  mood?: 'happy' | 'sleepy' | 'star'
  className?: string
}) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Blip, the Peak mascot">
      {/* sneakers */}
      <g>
        <ellipse cx="44" cy="106" rx="13" ry="8" fill="#ffe66d" stroke="#191725" strokeWidth="3" />
        <ellipse cx="76" cy="106" rx="13" ry="8" fill="#ffe66d" stroke="#191725" strokeWidth="3" />
        <rect x="33" y="108" width="22" height="5" rx="2.5" fill="#191725" />
        <rect x="65" y="108" width="22" height="5" rx="2.5" fill="#191725" />
      </g>
      {/* body */}
      <path
        d="M60 12 C 88 12, 102 38, 100 66 C 98 90, 80 100, 60 100 C 40 100, 22 90, 20 66 C 18 38, 32 12, 60 12 Z"
        fill="#45c8ff"
        stroke="#191725"
        strokeWidth="4"
      />
      {/* blush */}
      <ellipse cx="38" cy="66" rx="7" ry="4.5" fill="#1a7fd4" opacity="0.55" />
      <ellipse cx="82" cy="66" rx="7" ry="4.5" fill="#1a7fd4" opacity="0.55" />
      {/* eyes */}
      {mood === 'sleepy' ? (
        <g stroke="#191725" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M36 52 q6 6 12 0" />
          <path d="M72 52 q6 6 12 0" />
        </g>
      ) : (
        <g>
          <ellipse cx="44" cy="50" rx="11" ry="13" fill="#fffcf7" stroke="#191725" strokeWidth="3.5" />
          <ellipse cx="76" cy="50" rx="11" ry="13" fill="#fffcf7" stroke="#191725" strokeWidth="3.5" />
          <circle cx="47" cy="53" r="5" fill="#191725" />
          <circle cx="79" cy="53" r="5" fill="#191725" />
          <circle cx="49" cy="51" r="1.8" fill="#fffcf7" />
          <circle cx="81" cy="51" r="1.8" fill="#fffcf7" />
        </g>
      )}
      {/* mouth */}
      {mood === 'happy' && (
        <path d="M52 72 q8 8 16 0" stroke="#191725" strokeWidth="4" strokeLinecap="round" fill="none" />
      )}
      {mood === 'star' && (
        <g>
          <path d="M52 70 q8 10 16 0" stroke="#191725" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* star shades */}
          <g transform="translate(60 22)">
            <rect x="-16" y="-4" width="32" height="9" rx="4.5" fill="#191725" />
            <rect x="-14" y="-2.5" width="28" height="6" rx="3" fill="#9bd7ff" />
          </g>
        </g>
      )}
      {mood === 'sleepy' && (
        <g fill="#b9a3ff" stroke="#191725" strokeWidth="2">
          <text x="92" y="30" fontSize="16" fontWeight="900" stroke="none" fill="#b9a3ff">z</text>
          <text x="100" y="20" fontSize="12" fontWeight="900" stroke="none" fill="#b9a3ff">z</text>
        </g>
      )}
      {/* sparkle accent */}
      <path
        d="M96 84 l2.2 5.8 5.8 2.2 -5.8 2.2 -2.2 5.8 -2.2 -5.8 -5.8 -2.2 5.8 -2.2 Z"
        fill="#ffe66d"
        stroke="#191725"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
