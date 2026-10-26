import { useEffect, useState } from 'react'
import { fetchLatestRequest, type RequestWithCount } from '../lib/requests'
import { navigate } from '../App'
import { PeakMark } from './PeakWordmark'

/**
 * The feed's doorway into Put-me-on requests: shows the freshest ask,
 * or the invitation when nobody has asked yet. Tapping opens the
 * requests page.
 */
export default function RequestsStrip() {
  const [latest, setLatest] = useState<RequestWithCount | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    void fetchLatestRequest().then((r) => {
      if (!live) return
      setLatest(r)
      setLoaded(true)
    })
    return () => {
      live = false
    }
  }, [])

  if (!loaded) return null

  return (
    <button
      onClick={() => navigate('/requests')}
      className="block w-full border-b border-line bg-ink-2 px-4 py-3 text-left transition hover:border-sig/50"
    >
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-butter">
        <PeakMark className="h-3 w-auto" />
        Put me on
      </span>
      {latest ? (
        <>
          <span className="mt-0.5 block truncate text-[15px] font-bold">{latest.prompt}</span>
          <span className="block text-xs text-mute">
            @{latest.author?.username ?? '?'} is asking
            {latest.answerCount > 0
              ? ` · ${latest.answerCount} answer${latest.answerCount === 1 ? '' : 's'} so far`
              : ' · no answers yet'}
          </span>
        </>
      ) : (
        <>
          <span className="mt-0.5 block text-[15px] font-bold">Ask your people for a put-on</span>
          <span className="block text-xs text-mute">Best tacos near you? Date spot? Somebody knows.</span>
        </>
      )}
    </button>
  )
}
