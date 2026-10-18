/**
 * TALLY's original icon set — hand-drawn stroke icons in the brand language
 * (2px strokes, round caps, currentColor). No stock emoji.
 */

function base(className: string) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  } as const
}

export function PinIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M12 21.5s-6.8-5.8-6.8-11A6.8 6.8 0 0 1 12 3.7a6.8 6.8 0 0 1 6.8 6.8c0 5.2-6.8 11-6.8 11z" />
      <circle cx="12" cy="10.5" r="2.6" />
    </svg>
  )
}

export function ChartIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M4 4v15.5h16" />
      <path d="M7.5 15l3.8-4.8 3 3 4.7-5.7" />
      <path d="M15.5 7.5H19V11" />
    </svg>
  )
}

export function VideoIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" />
      <path d="M15.5 10.8l5-3v8.4l-5-3" />
    </svg>
  )
}

export function CardsIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="7.5" width="12" height="13" rx="2.5" />
      <path d="M7.5 7.5V6a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 21.5 6v11a2.5 2.5 0 0 1-2.5 2.5H17" />
    </svg>
  )
}

export function ChainIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <circle cx="6.5" cy="6.5" r="3" />
      <circle cx="17.5" cy="8.5" r="3" />
      <circle cx="10.5" cy="17.5" r="3" />
      <path d="M9 7.5l6 0.6M7.8 9.2l1.6 5.4M15.4 10.8l-3.2 4.4" />
    </svg>
  )
}

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L20.5 20.5" />
    </svg>
  )
}

export function ScoreIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="10"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        fontFamily="inherit"
      >
        10
      </text>
    </svg>
  )
}
