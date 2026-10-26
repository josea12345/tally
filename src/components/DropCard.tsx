import { useEffect, useRef, useState } from 'react'
import type { Drop, DropStats } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { isSeen } from '../lib/seen'
import { timeAgo, formatCount, topicKeyFor } from '../lib/format'
import { Avatar, navigate } from '../App'
import Comments from './Comments'
import Reveal from './Reveal'
import FeedVideo from './FeedVideo'
import MediaCarousel from './MediaCarousel'
import DragRateZone from './DragRateZone'
import ArtworkImage, { isArtworkUrl } from './ArtworkImage'
import MediaViewer from './MediaViewer'
import SoundPill from './SoundPill'
import { dropMedia, isPlaceCategory } from '../lib/types'
import { mapsUrlForPlace } from '../lib/geo'
import { safeExternalUrl } from '../lib/urls'
import BetIcon from './BetIcon'
import ChatIcon from './ChatIcon'
import DropMenu from './DropMenu'
import ShareButton from './ShareButton'
import { tapHaptic } from '../lib/haptics'
import { FlyToBet } from './VoteFx'
import MentionText from './MentionText'
import { PeakMark } from './PeakWordmark'
import { formatAvg, formatScore } from '../lib/ratings'

interface Props {
  drop: Drop
  stats: DropStats
  saved: boolean
  onToggleSave: () => void
  myRating: number | null
  /** Commit a rating immediately (in-photo drag). Optional: without it the photo drag is off. */
  onRateNow?: (score: number) => void
  /** Opens the rating sheet for this drop; prefill 10 comes from a double-tap. */
  onRate: (prefill?: number) => void
  revealDelay?: number
  onAuthorBlocked?: (authorId: string) => void
  /** How many visible put-ons share this drop's topic (null = not loaded yet). */
  topicCount?: number | null
  /** True when this card is in the feed only because of a topic follow. */
  viaTopic?: boolean
}

export default function DropCard({ drop, stats, saved, onToggleSave, myRating, onRate, onRateNow, revealDelay = 0, onAuthorBlocked, topicCount = null, viaTopic = false }: Props) {
  const { user } = useAuth()
  const author = drop.author
  const items = dropMedia(drop)
  const isAuthor = !!user && user.id === drop.author_id
  const [selfNote, setSelfNote] = useState(false)
  const selfNoteTimer = useRef<number | null>(null)
  const open = () => navigate(`/drop/${drop.id}`)
  const [heartPop, setHeartPop] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentCount, setCommentCount] = useState(stats.comments)
  const fxId = useRef(0)
  const [fly, setFly] = useState<{ from: DOMRect; id: number } | null>(null)
  // Fullscreen viewer (photos + video share the same TikTok-style viewer).
  const [viewerItem, setViewerItem] = useState<(typeof items)[number] | null>(null)
  useEffect(() => {
    setCommentCount(stats.comments)
  }, [stats.comments])

  const toggleComments = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowComments((s) => !s)
  }

  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    tapHaptic()
    if (!saved) {
      setHeartPop(false)
      requestAnimationFrame(() => setHeartPop(true))
      // Fly the bet icon into the Bets nav tab.
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      if (rect.width > 0) setFly({ from: rect, id: ++fxId.current })
    }
    onToggleSave()
  }

  // Rating opens the scorecard sheet (typed score). Authors can't rate
  // their own drops — their call is already on it — so flash why instead.
  const openRate = (prefill?: number) => {
    if (isAuthor) {
      setSelfNote(true)
      if (selfNoteTimer.current) clearTimeout(selfNoteTimer.current)
      selfNoteTimer.current = window.setTimeout(() => setSelfNote(false), 1600)
      return
    }
    tapHaptic()
    onRate(prefill)
  }

  // Double-tap on media opens the rating sheet with 10 loaded. Single/double disambiguated
  // with a short window so the fullscreen viewer doesn't open on a double-tap.
  const tapTimer = useRef<number | null>(null)
  const handleMediaTap = (isVideo: boolean, expandVideo?: () => void, expandPhoto?: () => void) => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current)
      tapTimer.current = null
      openRate(10)
    } else {
      tapTimer.current = window.setTimeout(() => {
        tapTimer.current = null
        if (isVideo) expandVideo?.()
        else expandPhoto?.()
      }, 280)
    }
  }

  // Score badge: glassy pill overlaid on the media's top-left, crowd
  // average only. The author's call lives in the card header (its own
  // pill, always visible) — one home per number.
  const extSegs = (dark: boolean) => (
    <>
      {drop.imdb_rating != null && (
        <span className={`ml-1 border-l pl-2 text-[10px] font-bold ${dark ? 'border-white/25 text-white/80' : 'border-line text-mute'}`}>
          IMDb {drop.imdb_rating}
        </span>
      )}
      {drop.spotify_popularity != null && (
        <span className={`ml-1 border-l pl-2 text-[10px] font-bold ${dark ? 'border-white/25 text-white/80' : 'border-line text-mute'}`}>
          Deezer {drop.spotify_popularity}
        </span>
      )}
    </>
  )
  const crowdLine = (dark: boolean) => (
    <div className="flex items-baseline gap-1">
      <span className="text-lg font-black leading-none text-sig">{formatAvg(stats.ratingAvg ?? 0)}</span>
      <span className={`text-[10px] font-bold ${dark ? 'text-white/80' : 'text-mute'}`}>
        · {stats.ratingCount} rating{stats.ratingCount === 1 ? '' : 's'}
      </span>
      {stats.peaks > 0 && (
        <span className="ml-1 flex items-center gap-1 border-l border-current/20 pl-2 text-[10px] font-bold text-sig">
          <PeakMark className="h-3 w-auto" />×{stats.peaks}
        </span>
      )}
      {extSegs(dark)}
    </div>
  )
  const calledLine = (dark: boolean) =>
    drop.score != null ? (
      <div className={`mt-0.5 text-[10px] font-bold ${dark ? 'text-white/70' : 'text-mute'}`}>
        called it {formatScore(drop.score)}
      </div>
    ) : null

  const scoreBadge =
    stats.ratingCount > 0 ? (
      <div className="sticker-flat rounded-2xl bg-black/55 px-3 py-1.5 backdrop-blur-sm" title="Crowd average">
        {crowdLine(true)}
      </div>
    ) : drop.imdb_rating != null ? (
      <div
        className="flex items-baseline gap-1 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm"
        title="IMDb rating"
      >
        <span className="text-lg font-black leading-none text-white">{drop.imdb_rating}</span>
        <span className="text-[10px] font-bold text-white/80">IMDb</span>
      </div>
    ) : null

  // Compact header score for text-only drops (no media to overlay).
  const headerScore =
    stats.ratingCount > 0 ? (
      <div className="sticker-flat shrink-0 rounded-2xl border-sig/50 bg-sig/10 px-3 py-1.5" title="Crowd average">
        {crowdLine(false)}
        {calledLine(false)}
      </div>
    ) : drop.score != null ? (
      <div
        className="sticker-flat flex shrink-0 items-baseline gap-1 rounded-full border-sig/50 bg-sig/10 px-3 py-1.5"
        title="Author's call"
      >
        <span className="text-xl font-black leading-none text-sig">{formatScore(drop.score)}</span>
        {extSegs(false)}
      </div>
    ) : drop.imdb_rating != null ? (
      <div
        className="flex shrink-0 items-baseline gap-1 rounded-full border border-line bg-ink-2 px-3 py-1.5"
        title="IMDb rating"
      >
        <span className="text-xl font-black leading-none">{drop.imdb_rating}</span>
        <span className="text-[11px] font-bold text-mute">IMDb</span>
      </div>
    ) : null

  // Title link target: the location for places, IMDb for movies/TV, else the external link.
  const titleUrl = (() => {
    if (isPlaceCategory(drop.category) && (drop.street_address || drop.city || drop.maps_url)) {
      return drop.street_address || drop.city
        ? mapsUrlForPlace(drop.title, drop.street_address, drop.city)
        : (drop.maps_url as string)
    }
    if (drop.imdb_id) return `https://www.imdb.com/title/${drop.imdb_id}/`
    if (drop.external_url) return safeExternalUrl(drop.external_url)
    return null
  })()

  // Title shown under the username in the header (linked when we have a target).
  // Centered per the founder's call; the username/handle row above stays left-aligned.
  // Right below it: the topic link — every put-on about this same place/title.
  // Seen drops (opened before, not mine) render their title dimmed.
  const seen = !!user && user.id !== drop.author_id && isSeen(drop.id)
  const titleLine = (
    <div className="relative">
      {titleUrl ? (
        <a
          href={titleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`block truncate px-9 text-center font-display text-[21px] font-bold leading-snug tracking-tight transition hover:text-sig ${
            seen ? 'text-mute' : 'text-fog'
          }`}
        >
          {drop.title} <span className="text-xs text-sig" aria-hidden>↗</span>
        </a>
      ) : (
        <div
          className={`truncate px-9 text-center font-display text-[21px] font-bold leading-snug tracking-tight ${seen ? 'text-mute' : ''}`}
        >
          {drop.title}
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          navigate(`/topic/${encodeURIComponent(drop.topic_key ?? topicKeyFor(drop))}`)
        }}
        aria-label={topicCount != null ? `${topicCount} put-ons about this` : 'All posts about this'}
        title={topicCount != null ? `${topicCount} put-ons about this` : 'All posts about this'}
        className="press absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-sig/40 bg-sig/10 p-1.5 text-sig"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-3.5 w-3.5" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2.5" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )

  // Horizontal action bar overlaid on the media's bottom edge.
  const bottomBar = (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-around bg-gradient-to-t from-black/70 via-black/25 to-transparent px-6 pb-2.5 pt-10"
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={toggleSave} aria-label={saved ? 'Remove try' : 'Try it'} className="press flex items-center gap-1.5">
        <span className={`${heartPop ? 'heart-pop' : ''} inline-block drop-shadow-lg ${saved ? 'text-sig' : 'text-white'}`}>
          <BetIcon saved={saved} className="h-6 w-6" />
        </span>
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(stats.saves)}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          openRate()
        }}
        aria-label="Rate this drop"
        className="press flex items-center gap-1.5"
      >
        <span className={`inline-block drop-shadow-lg ${myRating != null ? 'text-sig' : 'text-white'}`}>
          <PeakMark className="h-[18px] w-auto" />
        </span>
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(stats.ratingCount)}</span>
      </button>
      <button onClick={toggleComments} aria-label="Comments" className="press flex items-center gap-1.5">
        <ChatIcon className="h-6 w-6 text-white drop-shadow-lg" />
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(commentCount)}</span>
      </button>
      <ShareButton drop={drop} variant="overlay" />
    </div>
  )

  // Text-only drops: horizontal action row under the caption.
  const textActions = (
    <div className="flex items-center gap-5 px-4 pt-3" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          openRate()
        }}
        aria-label="Rate this drop"
        className="press flex items-center gap-1.5"
      >
        <span className={`inline-block ${myRating != null ? 'text-sig' : 'text-fog'}`}>
          <PeakMark className="h-4 w-auto" />
        </span>
        <span className="text-sm font-bold text-mute">{formatCount(stats.ratingCount)}</span>
      </button>
      <button
        onClick={toggleComments}
        aria-label="Comments"
        className="press flex items-center gap-1.5"
      >
        <ChatIcon className="h-[22px] w-[22px] text-fog" />
        <span className="text-sm font-bold text-mute">{formatCount(commentCount)}</span>
      </button>
      <button
        onClick={toggleSave}
        aria-label={saved ? 'Remove try' : 'Try it'}
        className="press ml-auto flex items-center gap-1.5"
      >
        <span className={`${heartPop ? 'heart-pop' : ''} inline-block ${saved ? 'text-sig' : 'text-fog'}`}>
          <BetIcon saved={saved} className="h-6 w-6" />
        </span>
        <span className="text-sm font-bold text-mute">{formatCount(stats.saves)}</span>
      </button>
      <ShareButton drop={drop} variant="row" />
    </div>
  )

  return (
    <Reveal delay={revealDelay}>
      <article
        onClick={open}
        className="relative cursor-pointer pb-8 [content-visibility:auto] [contain-intrinsic-size:auto_640px]"
      >
        {selfNote && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex justify-center">
            <span className="rounded-full bg-ink-3/95 px-4 py-2 text-xs font-bold text-fog shadow-lg">
              Your call is already on this one — authors don't rate their own drops
            </span>
          </div>
        )}
        {viaTopic && (
          <p className="px-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-butter">
            From a topic you follow
          </p>
        )}
        {/* header: who, when, their call, menu */}
        <div className="flex items-center gap-3 px-4">
          <div className="flex flex-col items-center gap-0.5">
            <div onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => author && navigate(`/profile/${author.id}`)}
                aria-label={author ? `Open @${author.username}` : 'profile'}
              >
                <Avatar url={author?.avatar_url ?? null} name={author?.display_name ?? author?.username ?? '?'} size={40} />
              </button>
            </div>
            {items.length > 0 && drop.score != null && (
              <span className="text-sm font-black leading-none text-sig">{formatScore(drop.score)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="truncate font-bold">{author?.display_name || author?.username || 'Someone'}</span>
              {author && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/profile/${author.id}`)
                  }}
                  className="truncate text-mute hover:text-sig"
                >
                  @{author.username}
                </button>
              )}
              <span className="shrink-0 text-mute">· {timeAgo(drop.created_at)}</span>
            </div>
            {titleLine}
          </div>
          {items.length === 0 && headerScore}
          <span className="shrink-0">
            <DropMenu drop={drop} onBlocked={(id) => onAuthorBlocked?.(id)} />
          </span>
        </div>

        {/* full-bleed media with horizontal action bar overlaid at the bottom */}
        {items.length > 0 && (
          <div className="relative mt-3" onClick={(e) => e.stopPropagation()}>
            {drop.sound_preview_url && (
              <div className="absolute bottom-[64px] left-1/2 z-20 -translate-x-1/2">
                <SoundPill
                  title={drop.sound_title ?? 'Soundtrack'}
                  artist={drop.sound_artist}
                  coverUrl={drop.sound_cover_url}
                  previewUrl={drop.sound_preview_url}
                  start={drop.sound_start_sec ?? 0}
                  end={drop.sound_end_sec}
                />
              </div>
            )}
            <DragRateZone
              current={myRating}
              onRate={(score) => onRateNow?.(score)}
              disabled={isAuthor || !onRateNow}
            >
            <MediaCarousel
              flush
              overlay={bottomBar}
              topBadge={scoreBadge}
              items={items}
              frameClass={
                items[0] && items[0].type === 'photo' && isArtworkUrl(items[0].url)
                  ? drop.category === 'music'
                    ? 'aspect-square'
                    : drop.category === 'movies' || drop.category === 'tv'
                      ? 'aspect-[2/3]'
                      : 'aspect-[9/16]'
                  : 'aspect-[9/16]'
              }
              renderItem={(it) =>
                it.type === 'video' ? (
                  <FeedVideo
                    src={it.url}
                    poster={it.posterUrl}
                    sound={
                      drop.sound_preview_url
                        ? {
                            previewUrl: drop.sound_preview_url,
                            start: drop.sound_start_sec ?? 0,
                            end: drop.sound_end_sec,
                          }
                        : null
                    }
                    onDoubleTap={() => openRate(10)}
                    onExpand={() => setViewerItem(it)}
                    edit={it.edit}
                  />
                ) : isArtworkUrl(it.url) ? (
                  <ArtworkImage
                    src={it.url}
                    alt={drop.title}
                    size="w780"
                    className="h-full w-full"
                    onClick={() => handleMediaTap(false, undefined, () => setViewerItem(it))}
                  />
                ) : (
                  <img
                    src={it.url}
                    alt={drop.title}
                    loading="lazy"
                    onClick={() => handleMediaTap(false, undefined, () => setViewerItem(it))}
                    className="h-full w-full object-cover"
                  />
                )
              }
            />
            </DragRateZone>
          </div>
        )}

        {/* caption */}
        <div className="px-4 pt-3">
          {drop.description ? (
            <p className="text-[15px] leading-snug">
              <span className="font-bold text-sig">Hear me out — </span>
              <span className="text-fog/90"><MentionText text={drop.description} /></span>
            </p>
          ) : null}
          {drop.category === 'recipes' && (drop.ingredients.length > 0 || drop.instructions.length > 0) && (
            <p className="mt-1 text-xs font-bold text-mute">
              Recipe · {drop.ingredients.length} ingredients · {drop.instructions.length} steps
            </p>
          )}
        </div>

        {items.length === 0 && textActions}

        {showComments && (
          <div className="px-4 pt-2" onClick={(e) => e.stopPropagation()}>
            <Comments dropId={drop.id} authorId={drop.author_id} onCountChange={setCommentCount} />
          </div>
        )}

        {/* full-screen FX, portaled to body */}
        {fly && <FlyToBet key={fly.id} from={fly.from} onDone={() => setFly(null)} />}
        {/* TikTok-style fullscreen viewer for photos + video */}
        {viewerItem && (
          <MediaViewer
            item={viewerItem}
            sound={
              drop.sound_preview_url
                ? {
                    previewUrl: drop.sound_preview_url,
                    title: drop.sound_title ?? 'Soundtrack',
                    start: drop.sound_start_sec ?? 0,
                    end: drop.sound_end_sec,
                  }
                : null
            }
            onClose={() => setViewerItem(null)}
            onDoubleTap={() => openRate(10)}
          />
        )}
      </article>
    </Reveal>
  )
}
