import { useEffect, useRef, useState } from 'react'

/**
 * TikTok-style feed clip: autoplays muted when on screen, pauses off screen.
 * Tap the video → fullscreen (native player, like X). Tap the badge → sound.
 * Respects the poster's cover frame.
 */
export default function FeedVideo({
  src,
  poster,
  className = '',
}: {
  src: string
  poster?: string | null
  className?: string
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fsRef = useRef(false)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const vid = ref.current
    const wrap = wrapRef.current
    if (!vid || !wrap || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[0]?.isIntersecting ?? false
        if (vis) {
          vid.play().catch(() => {})
        } else {
          vid.pause()
        }
      },
      { threshold: 0.45 },
    )
    io.observe(wrap)
    return () => io.disconnect()
  }, [src])

  // Re-mute when leaving fullscreen so the feed stays quiet.
  useEffect(() => {
    const vid = ref.current
    if (!vid) return
    const remute = () => {
      fsRef.current = false
      setMuted(true)
      if (ref.current) ref.current.muted = true
    }
    const onFsChange = () => {
      if (!document.fullscreenElement && fsRef.current) remute()
    }
    vid.addEventListener('webkitendfullscreen', remute)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      vid.removeEventListener('webkitendfullscreen', remute)
      document.removeEventListener('fullscreenchange', onFsChange)
    }
  }, [src])

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    const vid = ref.current
    if (!vid || failed) return
    const next = !muted
    setMuted(next)
    vid.muted = next
    if (!next) vid.play().catch(() => {})
  }

  /** Fullscreen like X: native player on iOS, Fullscreen API elsewhere. */
  const expand = () => {
    const vid = ref.current
    if (!vid || failed) return
    // Unmute for the fullscreen watch — this is a user gesture, so it's allowed.
    setMuted(false)
    vid.muted = false
    const anyVid = vid as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
    if (vid.requestFullscreen) {
      fsRef.current = true
      vid.requestFullscreen().catch(() => {
        fsRef.current = false
      })
    } else if (anyVid.webkitEnterFullscreen) {
      anyVid.webkitEnterFullscreen()
    }
  }

  if (failed) return null

  return (
    <div ref={wrapRef} className={`feed-video relative ${className}`}>
      <video
        ref={(el) => {
          ref.current = el
          if (el) el.muted = true
        }}
        src={src}
        poster={poster ?? undefined}
        playsInline
        muted
        loop
        autoPlay
        preload="metadata"
        onError={() => setFailed(true)}
        onClick={expand}
        className="max-h-[220px] w-full bg-black object-cover"
      />
      <button
        onClick={toggleSound}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[10px] backdrop-blur-sm"
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}
