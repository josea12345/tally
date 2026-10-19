import type { LocationState } from '../lib/types'

interface Props {
  state: LocationState
  effectiveLabel: string
  fromGps: boolean
  profileCity: string | null | undefined
  onLocate: () => void
  onUseCity: () => void
}

/** Honest location strip: GPS first, profile city fallback, every off-state explained. */
export default function LocationStrip({ state, effectiveLabel, fromGps, profileCity, onLocate, onUseCity }: Props) {
  const status = state.status

  if (status === 'on') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3">
        <p className="flex items-center gap-2 text-sm">
          <span className="text-sig">◉</span>
          <span>
            You're near <b>{effectiveLabel}</b>
          </span>
        </p>
        <button onClick={onUseCity} className="shrink-0 text-xs font-bold text-mute hover:text-fog">
          Use my city
        </button>
      </div>
    )
  }

  if (status === 'locating') {
    return (
      <div className="rounded-2xl border border-line bg-ink-2 px-4 py-3 text-sm text-mute">
        Finding where you are…
      </div>
    )
  }

  const explainer: Record<string, string> = {
    denied: `Location's blocked for TALLY, so results are based on ${profileCity ?? 'Miami'} (your profile city). Allow location in your browser settings, then tap Locate me.`,
    unavailable: `Couldn't get your location on this device, so results are based on ${profileCity ?? 'Miami'} (your profile city).`,
    timeout: `Location timed out, so results are based on ${profileCity ?? 'Miami'} (your profile city). Try again.`,
    off: `Results are based on ${effectiveLabel} — your profile city, not where you are right now.`,
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-mute">
        <span className="mt-0.5 shrink-0 text-sig">◉</span>
        <span>{explainer[status] ?? explainer.off}</span>
      </p>
      <button
        onClick={onLocate}
        className="shrink-0 rounded-full bg-sig px-4 py-2 text-xs font-black text-ink"
      >
        Locate me
      </button>
      {fromGps === false && status !== 'off' && (
        <button onClick={onUseCity} className="shrink-0 text-xs font-bold text-mute">
          Use my city
        </button>
      )}
    </div>
  )
}
