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

export default function ArtworkImage({
  src,
  alt,
  onClick,
  className = '',
}: {
  src: string
  alt: string
  onClick?: () => void
  /** Sizing for the frame, e.g. "h-full w-full" (feed) or "h-[380px] w-full" (detail). */
  className?: string
}) {
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
