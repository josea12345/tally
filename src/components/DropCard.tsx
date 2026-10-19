import { useEffect, useRef, useState } from 'react'
import type { Drop, DropStats } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { timeAgo, formatCount, topicKeyFor } from '../lib/format'
import { Avatar, navigate } from '../App'
import Comments from './Comments'
import Reveal from './Reveal'
import FeedVideo from './FeedVideo'
import MediaCarousel from './MediaCarousel'
import MediaViewer from './MediaViewer'
import { dropMedia, isPlaceCategory } from '../lib/types'
import { mapsUrlForPlace } from '../lib/geo'
import { safeExternalUrl } from '../lib/urls'
import TallyIcon from './TallyIcon'
import ChatIcon from './ChatIcon'
import DropMenu from './DropMenu'
import { VerdictBurst, FlyToTally } from './VoteFx'

interface Props {
  drop: Drop
  stats: DropStats
  saved: boolean
  onToggleSave: () => void
  myVote: 'W' | 'L' | null
  onVote: (v: 'W' | 'L') => void
  revealDelay?: number
  onAuthorBlocked?: (authorId: string) => void
  /** How many visible put-ons share this drop's topic (null = not loaded yet). */
  topicCount?: number | null
}

export default function DropCard({ drop, stats, saved, onToggleSave, myVote, onVote, revealDelay = 0, onAuthorBlocked, topicCount = null }: Props) {
  const { user } = useAuth()
  const author = drop.author
  const items = dropMedia(drop)
  const isAuthor = !!user && user.id === drop.author_id
  const [selfNote, setSelfNote] = useState(false)
  const selfNoteTimer = useRef<number | null>(null)
  const open = () => navigate(`/drop/${drop.id}`)
  const [heartPop, setHeartPop] = useState(false)
  const [slam, setSlam] = useState<'W' | 'L' | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [commentCount, setCommentCount] = useState(stats.comments)
  const fxId = useRef(0)
  const [burst, setBurst] = useState<{ v: 'W' | 'L'; id: number } | null>(null)
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
    if (!saved) {
      setHeartPop(false)
      requestAnimationFrame(() => setHeartPop(true))
      // Fly the tally icon into the Tallies nav tab.
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      if (rect.width > 0) setFly({ from: rect, id: ++fxId.current })
    }
    onToggleSave()
  }

  // One tap = "I've tried it, calling it." Voting implies tried.
  // Authors can't vote on their own drops — flash why instead of silently doing nothing.
  const doVote = (v: 'W' | 'L') => {
    if (isAuthor) {
      setSelfNote(true)
      if (selfNoteTimer.current) clearTimeout(selfNoteTimer.current)
      selfNoteTimer.current = window.setTimeout(() => setSelfNote(false), 1600)
      return
    }
    setSlam(v)
    setTimeout(() => setSlam((s) => (s === v ? null : s)), 420)
    if (myVote !== v) setBurst({ v, id: ++fxId.current })
    onVote(v)
  }
  const castVote = (e: React.MouseEvent, v: 'W' | 'L') => {
    e.stopPropagation()
    doVote(v)
  }

  // Double-tap on media = W (Instagram-style). Single/double disambiguated
  // with a short window so the fullscreen viewer doesn't open on a double-tap.
  const tapTimer = useRef<number | null>(null)
  const handleMediaTap = (isVideo: boolean, expandVideo?: () => void, expandPhoto?: () => void) => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current)
      tapTimer.current = null
      if (myVote !== 'W') doVote('W')
    } else {
      tapTimer.current = window.setTimeout(() => {
        tapTimer.current = null
        if (isVideo) expandVideo?.()
        else expandPhoto?.()
      }, 280)
    }
  }

  // Score badge: glassy pill overlaid on the media's top-left (text-only drops keep it in the header).
  const scoreBadge =
    drop.score != null ? (
      <div
        className="sticker-flat flex items-baseline gap-1 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm"
        title="Author's call"
      >
        <span className="text-lg font-black leading-none text-sig">{drop.score}</span>
        <span className="text-[10px] font-bold text-white/80">/10</span>
        {drop.imdb_rating != null && (
          <span className="ml-1 border-l border-white/25 pl-2 text-[10px] font-bold text-white/80">
            IMDb {drop.imdb_rating}
          </span>
        )}
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
    drop.score != null ? (
      <div
        className="sticker-flat flex shrink-0 items-baseline gap-1 rounded-full border-sig/50 bg-sig/10 px-3 py-1.5"
        title="Author's call"
      >
        <span className="text-xl font-black leading-none text-sig">{drop.score}</span>
        <span className="text-[11px] font-bold text-mute">/10</span>
        {drop.imdb_rating != null && (
          <span className="ml-1 border-l border-line pl-2 text-[11px] font-bold text-mute">
            IMDb {drop.imdb_rating}
          </span>
        )}
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
  const titleLine = (
    <>
      {titleUrl ? (
        <a
          href={titleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="block truncate text-center text-[15px] font-bold tracking-tight text-fog transition hover:text-sig"
        >
          {drop.title} <span className="text-xs text-sig" aria-hidden>↗</span>
        </a>
      ) : (
        <div className="truncate text-center text-[15px] font-bold tracking-tight">{drop.title}</div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          navigate(`/topic/${encodeURIComponent(drop.topic_key ?? topicKeyFor(drop))}`)
        }}
        className="press mx-auto mt-1.5 flex items-center gap-1.5 rounded-full border border-sig/40 bg-sig/10 px-3 py-1 text-[11px] font-black text-sig"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-3 w-3" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2.5" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" strokeLinecap="round" />
        </svg>
        {topicCount != null ? `${topicCount} put-on${topicCount === 1 ? '' : 's'}` : 'All posts about this'}
        <span aria-hidden>→</span>
      </button>
    </>
  )

  // Horizontal action bar overlaid on the media's bottom edge.
  const bottomBar = (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-around bg-gradient-to-t from-black/70 via-black/25 to-transparent px-6 pb-2.5 pt-10"
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={toggleSave} aria-label={saved ? 'Untally' : 'Tally'} className="press flex items-center gap-1.5">
        <span className={`${heartPop ? 'heart-pop' : ''} inline-block drop-shadow-lg ${saved ? 'text-sig' : 'text-white'}`}>
          <TallyIcon saved={saved} className="h-6 w-6" />
        </span>
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(stats.saves)}</span>
      </button>
      <button onClick={(e) => castVote(e, 'W')} aria-label="Vote W" className="press flex items-center gap-1.5">
        <span className={`${slam === 'W' ? 'verdict-slam' : ''} inline-block text-xl font-black leading-none drop-shadow-lg ${myVote === 'W' ? 'text-win' : 'text-white'}`}>W</span>
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(stats.wins)}</span>
      </button>
      <button onClick={(e) => castVote(e, 'L')} aria-label="Vote L" className="press flex items-center gap-1.5">
        <span className={`${slam === 'L' ? 'verdict-slam' : ''} inline-block text-xl font-black leading-none drop-shadow-lg ${myVote === 'L' ? 'text-miss' : 'text-white'}`}>L</span>
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(stats.losses)}</span>
      </button>
      <button onClick={toggleComments} aria-label="Comments" className="press flex items-center gap-1.5">
        <ChatIcon className="h-6 w-6 text-white drop-shadow-lg" />
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(commentCount)}</span>
      </button>
    </div>
  )

  // Text-only drops: horizontal action row under the caption.
  const textActions = (
    <div className="flex items-center gap-5 px-4 pt-3" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => castVote(e, 'W')}
        aria-label="Vote W"
        className="press flex items-center gap-1.5"
      >
        <span className={`${slam === 'W' ? 'verdict-slam' : ''} inline-block text-[22px] font-black leading-none ${myVote === 'W' ? 'text-win' : 'text-fog'}`}>W</span>
        <span className="text-sm font-bold text-mute">{formatCount(stats.wins)}</span>
      </button>
      <button
        onClick={(e) => castVote(e, 'L')}
        aria-label="Vote L"
        className="press flex items-center gap-1.5"
      >
        <span className={`${slam === 'L' ? 'verdict-slam' : ''} inline-block text-[22px] font-black leading-none ${myVote === 'L' ? 'text-miss' : 'text-fog'}`}>L</span>
        <span className="text-sm font-bold text-mute">{formatCount(stats.losses)}</span>
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
        aria-label={saved ? 'Untally' : 'Tally'}
        className="press ml-auto flex items-center gap-1.5"
      >
        <span className={`${heartPop ? 'heart-pop' : ''} inline-block ${saved ? 'text-sig' : 'text-fog'}`}>
          <TallyIcon saved={saved} className="h-6 w-6" />
        </span>
        <span className="text-sm font-bold text-mute">{formatCount(stats.saves)}</span>
      </button>
    </div>
  )

  return (
    <Reveal delay={revealDelay}>
      <article onClick={open} className="relative cursor-pointer pb-8">
        {selfNote && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex justify-center">
            <span className="rounded-full bg-ink-3/95 px-4 py-2 text-xs font-bold text-fog shadow-lg">
              You can't call W/L on your own drop
            </span>
          </div>
        )}
        {/* header: who, when, their call, menu */}
        <div className="flex items-center gap-3 px-4">
          <div onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => author && navigate(`/profile/${author.id}`)}
              aria-label={author ? `Open @${author.username}` : 'profile'}
            >
              <Avatar url={author?.avatar_url ?? null} name={author?.display_name ?? author?.username ?? '?'} size={40} />
            </button>
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
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <MediaCarousel
              flush
              overlay={bottomBar}
              topBadge={scoreBadge}
              items={items}
              renderItem={(it) =>
                it.type === 'video' ? (
                  <FeedVideo
                    src={it.url}
                    poster={it.posterUrl}
                    onDoubleTap={() => {
                      if (myVote !== 'W') doVote('W')
                    }}
                    onExpand={() => setViewerItem(it)}
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
          </div>
        )}

        {/* caption */}
        <div className="px-4 pt-3">
          {drop.description ? (
            <p className="text-[15px] leading-snug">
              <span className="font-bold text-sig">Hear me out — </span>
              <span className="text-fog/90">{drop.description}</span>
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
        {burst && <VerdictBurst key={burst.id} v={burst.v} onDone={() => setBurst(null)} />}
        {fly && <FlyToTally key={fly.id} from={fly.from} onDone={() => setFly(null)} />}
        {/* TikTok-style fullscreen viewer for photos + video */}
        {viewerItem && (
          <MediaViewer
            item={viewerItem}
            onClose={() => setViewerItem(null)}
            onDoubleTap={() => {
              if (myVote !== 'W') doVote('W')
            }}
          />
        )}
      </article>
    </Reveal>
  )
}
