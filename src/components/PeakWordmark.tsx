/**
 * Peak brand marks — the approved Gen-Z wordmark: chunky rounded-stroke
 * letters on a rising slant, the A drawn as a peak with three shine rays.
 * Pure paths (no font dependency); strokes use currentColor, so wrap in a
 * text-sig (or any text-*) element to color them per theme.
 */
export function PeakWordmark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 360" className={className} role="img" aria-label="Peak" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g transform="rotate(-5 320 190)">
        <path d="M120 252 L120 102 L152 102 A30 30 0 0 1 152 162 L120 162" strokeWidth={34} />
        <path d="M264 106 L206 106 L206 250 L266 250 M206 177 L254 177" strokeWidth={33} />
        <path d="M290 252 L348 94 L408 252" strokeWidth={38} />
        <path d="M442 100 L442 252 M502 106 L448 170 L510 250" strokeWidth={35} />
        <path d="M348 56 L348 26 M315 64 L296 40 M381 64 L400 40" strokeWidth={13} />
      </g>
    </svg>
  )
}

/** The A by itself: peak + rays, for tight spaces (badges, loaders). */
export function PeakMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Peak" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M156 384 L256 128 L356 384" strokeWidth={46} />
      <path d="M256 82 L256 40 M212 96 L188 58 M300 96 L324 58" strokeWidth={17} />
    </svg>
  )
}
