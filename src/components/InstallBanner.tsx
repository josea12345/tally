import { useEffect, useState } from 'react'

const DISMISS_KEY = 'tally_install_dismissed_v1'

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** In-app install banner. Native prompt where offered; honest iOS steps otherwise. */
export default function InstallBanner() {
  const [deferred, setDeferred] = useState<Event | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (isStandalone() || dismissed) return null
  const canOffer = !!deferred || isIOS()
  if (!canOffer) return null

  const install = async () => {
    if (deferred && 'prompt' in deferred) {
      ;(deferred as unknown as { prompt: () => Promise<void> }).prompt()
      setDeferred(null)
    } else if (isIOS()) {
      setShowIOSHelp(true)
    }
  }

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="border-b border-line bg-ink-2 px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-xl font-black text-ink">
          T
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">TALLY, on your home screen</div>
          <div className="truncate text-xs text-mute">Good taste deserves a track record.</div>
          {showIOSHelp && (
            <div className="mt-1 text-xs text-mute">
              Tap <span className="font-bold text-fog">Share</span> in Safari, then{' '}
              <span className="font-bold text-fog">Add to Home Screen</span>.
            </div>
          )}
        </div>
        <button
          onClick={install}
          className="shrink-0 rounded-full bg-lime px-4 py-2 text-sm font-black text-ink"
        >
          Add to home screen
        </button>
        <button onClick={dismiss} className="shrink-0 px-2 text-sm text-mute" aria-label="Not now">
          Not now
        </button>
      </div>
    </div>
  )
}
