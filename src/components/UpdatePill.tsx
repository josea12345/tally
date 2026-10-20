import { useEffect, useState } from 'react'

/**
 * "New version — tap to refresh" pill. A Vite build stamps a fresh hash
 * into the bundle filename on every deploy; if the served index.html
 * names a different bundle than the one running, a newer build exists.
 * The service worker is network-first for navigations, so a reload
 * always lands the fresh shell — no more delete-and-re-add-the-app.
 */
function hashFromHtml(html: string): string | null {
  const m = html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)
  return m ? m[1] : null
}

function runningHash(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[src*="assets/index-"]')
  if (!el) return null
  const m = el.src.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)
  return m ? m[1] : null
}

export default function UpdatePill() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let stop = false
    const check = async () => {
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = hashFromHtml(await res.text())
        const current = runningHash()
        if (!stop && latest && current && latest !== current) setShow(true)
      } catch {
        // Offline or mid-deploy — stay quiet, the next check retries.
      }
    }
    const first = setTimeout(check, 30_000)
    const id = setInterval(check, 5 * 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop = true
      clearTimeout(first)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (!show) return null
  return (
    <button
      onClick={() => window.location.reload()}
      className="press fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-sig px-5 py-2.5 text-sm font-black text-ink shadow-2xl md:bottom-8"
    >
      New version — tap to refresh
    </button>
  )
}
