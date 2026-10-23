/**
 * The Bet icon: a bookmark in the same rounded-stroke language as the rest
 * of the icon set. Unsaved = outline waiting; saved = filled. Uses
 * currentColor so it adapts to context (sig when betted, ink on the nav).
 */
export default function BetIcon({ saved, className = '' }: { saved: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M7.5 3.8h9a1.2 1.2 0 0 1 1.2 1.2v14.1c0 .6-.7 1-1.2.6L12 16.9l-4.5 2.8c-.5.4-1.2 0-1.2-.6V5a1.2 1.2 0 0 1 1.2-1.2Z"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  )
}
