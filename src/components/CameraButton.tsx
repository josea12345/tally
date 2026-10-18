import { useRef, useState } from 'react'
import { navigate } from '../App'
import { setPendingRawMedia } from '../lib/pendingMedia'
import { CLIP_MAX_SECONDS } from '../lib/video'

const MAX_BYTES = 20 * 1024 * 1024

/**
 * Instant capture. Tapping opens a Photo / Video sheet; on mobile each input's
 * `capture` attribute opens the native camera directly in the right mode.
 * Render-prop so the mobile nav and desktop rail can style the trigger freely.
 */
export default function CameraButton({
  children,
}: {
  children: (open: () => void) => React.ReactNode
}) {
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState(false)

  const open = () => setSheet(true)

  const onFile = (f: File | undefined, kind: 'photo' | 'video') => {
    if (!f) return
    setSheet(false)
    const okType = kind === 'photo' ? f.type.startsWith('image/') : f.type.startsWith('video/')
    if (!okType || f.size > MAX_BYTES) return
    setPendingRawMedia(f, f.name || (kind === 'photo' ? 'camera.jpg' : 'clip.mp4'), kind)
    navigate(kind === 'photo' ? '/filter' : '/video')
  }

  const pick = (kind: 'photo' | 'video') => {
    ;(kind === 'photo' ? photoRef : videoRef).current?.click()
  }

  return (
    <>
      {children(open)}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          onFile(e.target.files?.[0], 'photo')
          e.target.value = ''
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          onFile(e.target.files?.[0], 'video')
          e.target.value = ''
        }}
      />
      {sheet && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Camera">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSheet(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-line bg-ink-2 p-4 pb-8">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <button
              onClick={() => pick('photo')}
              className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition hover:bg-ink-3"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime text-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-6 w-6">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.5 7l1.2-2h4.6L15.5 7M4 7h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"
                  />
                  <circle cx="12" cy="13.5" r="3.4" />
                </svg>
              </span>
              <span>
                <span className="block text-base font-black">Photo</span>
                <span className="block text-xs text-mute">Snap it, filter it, post it</span>
              </span>
            </button>
            <button
              onClick={() => pick('video')}
              className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition hover:bg-ink-3"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime text-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-6 w-6">
                  <rect x="3" y="6" width="13" height="12" rx="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 10.5l5-3v9l-5-3" />
                </svg>
              </span>
              <span>
                <span className="block text-base font-black">Video</span>
                <span className="block text-xs text-mute">{CLIP_MAX_SECONDS} seconds max</span>
              </span>
            </button>
            <button
              onClick={() => setSheet(false)}
              className="mt-2 w-full rounded-full border border-line py-3 text-sm font-black text-mute"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
