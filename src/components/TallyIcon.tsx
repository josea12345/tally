/**
 * TALLY's signature save icon. Unsaved = four strokes waiting; saved = the
 * diagonal slash completes the five. Uses currentColor so it adapts to
 * whatever context it's in (lime when saved on cards, ink on the nav pill).
 */
export default function TallyIcon({ saved, className = '' }: { saved: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <line x1="6" y1="4.5" x2="6" y2="19.5" />
        <line x1="10.4" y1="4.5" x2="10.4" y2="19.5" />
        <line x1="14.8" y1="4.5" x2="14.8" y2="19.5" />
        <line x1="19.2" y1="4.5" x2="19.2" y2="19.5" />
        {saved && <line x1="3.5" y1="18.5" x2="21" y2="5.5" />}
      </g>
    </svg>
  )
}
