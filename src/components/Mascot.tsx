/**
 * Blip — Peak's mascot, now a penguin. A small original SVG: round ink
 * body, cream face and belly, a hot-light-blue scarf (brand color),
 * butter-orange beak and feet, pink blush. Lightweight (single inline
 * SVG, no assets), used for onboarding, empty states, the walkthrough
 * and celebration moments — never obstructing content.
 */
export default function Mascot({
  mood = 'happy',
  className = '',
}: {
  mood?: 'happy' | 'sleepy' | 'star'
  className?: string
}) {
  const ink = '#191725'
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Blip, the Peak penguin">
      {/* feet */}
      <g>
        <ellipse cx="45" cy="108" rx="12" ry="6" fill="#ffb84d" stroke={ink} strokeWidth="3" />
        <ellipse cx="75" cy="108" rx="12" ry="6" fill="#ffb84d" stroke={ink} strokeWidth="3" />
      </g>
      {/* flippers */}
      <ellipse cx="19" cy="72" rx="7" ry="16" transform="rotate(16 19 72)" fill="#262640" stroke={ink} strokeWidth="3" />
      <ellipse cx="101" cy="72" rx="7" ry="16" transform="rotate(-16 101 72)" fill="#262640" stroke={ink} strokeWidth="3" />
      {/* body */}
      <path
        d="M60 14 C 86 14, 98 40, 98 68 C 98 92, 82 104, 60 104 C 38 104, 22 92, 22 68 C 22 40, 34 14, 60 14 Z"
        fill="#262640"
        stroke={ink}
        strokeWidth="4"
      />
      {/* head tuft */}
      <g stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M58 14 q-3 -8 -10 -9" />
        <path d="M63 13 q1 -8 8 -10" />
      </g>
      {/* belly + face (one cream front) */}
      <ellipse cx="60" cy="79" rx="23" ry="24" fill="#fffcf7" />
      <ellipse cx="60" cy="44" rx="27" ry="22" fill="#fffcf7" />
      {/* scarf */}
      <g>
        <rect x="76" y="64" width="10" height="17" rx="4.5" transform="rotate(8 81 72)" fill="#45c8ff" stroke={ink} strokeWidth="3" />
        <rect x="33" y="59" width="54" height="11" rx="5.5" fill="#45c8ff" stroke={ink} strokeWidth="3" />
      </g>
      {/* blush */}
      <ellipse cx="35" cy="55" rx="6" ry="3.5" fill="#ff9db0" opacity="0.8" />
      <ellipse cx="85" cy="55" rx="6" ry="3.5" fill="#ff9db0" opacity="0.8" />
      {/* eyes */}
      {mood === 'sleepy' ? (
        <g stroke={ink} strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M40 45 q6 5 12 0" />
          <path d="M68 45 q6 5 12 0" />
        </g>
      ) : mood === 'star' ? (
        <g>
          <circle cx="47" cy="44" r="5.5" fill={ink} />
          <circle cx="73" cy="44" r="5.5" fill={ink} />
          {/* star shades */}
          <g transform="translate(60 30)">
            <rect x="-24" y="-5" width="48" height="10" rx="5" fill={ink} />
            <rect x="-21" y="-3" width="42" height="6" rx="3" fill="#9bd7ff" />
          </g>
        </g>
      ) : (
        <g>
          <circle cx="47" cy="44" r="6" fill={ink} />
          <circle cx="73" cy="44" r="6" fill={ink} />
          <circle cx="49" cy="42" r="2" fill="#fffcf7" />
          <circle cx="75" cy="42" r="2" fill="#fffcf7" />
          <circle cx="45.5" cy="46.5" r="1.1" fill="#fffcf7" />
          <circle cx="71.5" cy="46.5" r="1.1" fill="#fffcf7" />
        </g>
      )}
      {/* beak */}
      <path
        d="M51 51 Q60 48 69 51 Q65 59 60 59 Q55 59 51 51 Z"
        fill="#ffb84d"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* sleepy z's */}
      {mood === 'sleepy' && (
        <g fontWeight="900" fill="#b9a3ff">
          <text x="92" y="32" fontSize="16">z</text>
          <text x="101" y="21" fontSize="12">z</text>
        </g>
      )}
      {/* sparkle accent */}
      <path
        d="M101 14 l1.8 4.8 4.8 1.8 -4.8 1.8 -1.8 4.8 -1.8 -4.8 -4.8 -1.8 4.8 -1.8 Z"
        fill="#ffe66d"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
