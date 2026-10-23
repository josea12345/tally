/**
 * AlertIcon — Peak's original notification mark: tally strokes with broadcast
 * arcs rising off them. "News about your record." Drawn in the same stroke
 * language as TallyIcon; uses currentColor.
 */
export default function AlertIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {/* broadcast arcs */}
      <path d="M5.5 6.3A7 7 0 0 1 16.5 6.3" />
      <path d="M8 8.8A4.2 4.2 0 0 1 14 8.8" />
      {/* tally strokes */}
      <path d="M6.5 12v7" />
      <path d="M9.5 12v7" />
      <path d="M12.5 12v7" />
      <path d="M15.5 12v7" />
    </svg>
  )
}
