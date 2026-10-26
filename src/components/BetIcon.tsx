/**
 * The Try icon: a summit flag in the same rounded-stroke language as the
 * rest of the icon set — the flag you plant on a peak you're coming back
 * for. Not planted = outline waiting; planted = the cloth fills. Uses
 * currentColor so it adapts to context (sig on the card, ink on the nav).
 * (File/identifier kept from the Bet era; the glyph and the word are Try.)
 */
export default function BetIcon({ saved, className = '' }: { saved: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6.5 3.5v17" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path
        d="M6.5 4.2c3-1.4 6 1.2 10.8 0v7c-4.8 1.2-7.8-1.4-10.8 0Z"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  )
}
