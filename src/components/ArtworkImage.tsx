/**
 * Picked cover art (album covers, movie/TV posters) arrives from Deezer /
 * TMDB CDNs in square or 2:3 shapes that the tall feed frame would crop
 * badly. Artwork slides render the full art over a blurred blow-up of
 * itself — nothing cropped. User-uploaded media never uses this; it is
 * keyed strictly to the artwork CDNs.
 */
export function isArtworkUrl(url: string): boolean {
  return url.includes('dzcdn.net') || url.includes('image.tmdb.org')
}

export type ArtworkSize = 'original' | 'w1280' | 'w780' | 'w500'

/**
 * TMDB serves every poster at several sizes; picks used to be stored at
 * w342, which turns to mush in a full-width frame. Rewrite the size
 * segment at render time so existing posts sharpen too — sized to the
 * surface: cards and grids pull w780/w500 (a fraction of the bytes of
 * `original`), detail and share cards keep the full-res version.
 */
export function hiResArtwork(url: string, size: ArtworkSize = 'original'): string {
  if (!url.includes('image.tmdb.org/t/p/')) return url
  return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`)
}

export default function ArtworkImage({
  src: rawSrc,
  alt,
  onClick,
  className = '',
  size = 'w1280',
}: {
  src: string
  alt: string
  onClick?: () => void
  /** Sizing for the frame, e.g. "h-full w-full" (feed) or "h-[380px] w-full" (detail). */
  className?: string
  size?: ArtworkSize
}) {
  const src = hiResArtwork(rawSrc, size)
  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-2xl"
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={onClick}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  )
}
