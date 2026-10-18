import { useEffect, useRef, useState } from 'react'

/**
 * TikTok-style feed clip: autoplays muted when on screen, pauses off screen,
 * tap toggles sound. Respects the poster's cover frame.
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

  const toggleSound = () => {
    const vid = ref.current
    if (!vid || failed) return
    const next = !muted
    setMuted(next)
    vid.muted = next
    if (!next) vid.play().catch(() => {})
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
        onClick={toggleSound}
        className="max-h-[220px] w-full bg-black object-cover"
      />
      <div className="pointer-events-none absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[10px] backdrop-blur-sm">
        {muted ? '🔇' : '🔊'}
      </div>
    </div>
  )
}
