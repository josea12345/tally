import { useRef, useState } from 'react'
import type { Drop } from '../lib/types'
import { shareDrop } from '../lib/share'

export function ShareIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path d="M12 15V3.5" strokeLinecap="round" />
      <path d="M8 6L12 2l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Share icon button for drop action bars. `overlay` = white on media;
 * `row` = theme-ink colors for text-only cards. The clipboard fallback
 * flashes a check so the user knows the link landed.
 */
export default function ShareButton({
  drop,
  variant = 'overlay',
}: {
  drop: Drop
  variant?: 'overlay' | 'row'
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  const onShare = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const r = await shareDrop(drop)
    if (r === 'copied') {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    }
  }

  const color =
    variant === 'overlay' ? 'text-white drop-shadow-lg' : copied ? 'text-win' : 'text-fog'

  return (
    <button onClick={onShare} aria-label="Share drop" className="press flex items-center gap-1.5">
      <span className={`inline-block ${color}`}>
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-6 w-6" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <ShareIcon className={variant === 'overlay' ? 'h-6 w-6' : 'h-[22px] w-[22px]'} />
        )}
      </span>
    </button>
  )
}
