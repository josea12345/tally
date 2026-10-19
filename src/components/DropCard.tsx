import { useEffect, useState } from 'react'
import type { Drop, DropStats } from '../lib/types'
import { timeAgo, formatCount } from '../lib/format'
import { Avatar, navigate } from '../App'
import LinkChips from './LinkChips'
import Comments from './Comments'
import Reveal from './Reveal'
import FeedVideo from './FeedVideo'
import MediaCarousel from './MediaCarousel'
import { dropMedia } from '../lib/types'
import TallyIcon from './TallyIcon'
import ChatIcon from './ChatIcon'
import DropMenu from './DropMenu'

interface Props {
  drop: Drop
  stats: DropStats
  saved: boolean
  onToggleSave: () => void
  myVote: 'W' | 'L' | null
  onVote: (v: 'W' | 'L') => void
  revealDelay?: number
  onAuthorBlocked?: (authorId: string) => void
}

export default function DropCard({ drop, stats, saved, onToggleSave, myVote, onVote, revealDelay = 0, onAuthorBlocked }: Props) {
  const author = drop.author
  const items = dropMedia(drop)
  const open = () => navigate(`/drop/${drop.id}`)
  const [heartPop, setHeartPop] = useState(false)
  const [slam, setSlam] = useState<'W' | 'L' | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [commentCount, setCommentCount] = useState(stats.comments)
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
    }
    onToggleSave()
  }

  // One tap = "I've tried it, calling it." Voting implies tried.
  const castVote = (e: React.MouseEvent, v: 'W' | 'L') => {
    e.stopPropagation()
    setSlam(v)
    setTimeout(() => setSlam((s) => (s === v ? null : s)), 380)
    onVote(v)
  }

  // Horizontal action bar overlaid on the media's bottom edge.
  const bottomBar = (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-around bg-gradient-to-t from-black/70 via-black/25 to-transparent px-6 pb-2.5 pt-10"
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={toggleSave} aria-label={saved ? 'Untally' : 'Tally'} className="press flex items-center gap-1.5">
        <span className={`${heartPop ? 'heart-pop' : ''} inline-block drop-shadow-lg ${saved ? 'text-lime' : 'text-white'}`}>
          <TallyIcon saved={saved} className="h-6 w-6" />
        </span>
        <span className="text-xs font-bold text-white drop-shadow-md">{formatCount(stats.saves)}</span>
      </button>
      <button onClick={(e) => castVote(e, 'W')} aria-label="Vote W" className="press flex items-center gap-1.5">
        <span className={`${slam === 'W' ? 'verdict-slam' : ''} inline-block text-xl font-black leading-none drop-shadow-lg ${myVote === 'W' ? 'text-lime' : 'text-white'}`}>W</span>
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
        <span className={`${slam === 'W' ? 'verdict-slam' : ''} inline-block text-[22px] font-black leading-none ${myVote === 'W' ? 'text-lime' : 'text-fog'}`}>W</span>
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
        <span className={`${heartPop ? 'heart-pop' : ''} inline-block ${saved ? 'text-lime' : 'text-fog'}`}>
          <TallyIcon saved={saved} className="h-6 w-6" />
        </span>
        <span className="text-sm font-bold text-mute">{formatCount(stats.saves)}</span>
      </button>
    </div>
  )

  return (
    <Reveal delay={revealDelay}>
      <article onClick={open} className="cursor-pointer pb-8">
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
                  className="truncate text-mute hover:text-lime"
                >
                  @{author.username}
                </button>
              )}
              <span className="shrink-0 text-mute">· {timeAgo(drop.created_at)}</span>
            </div>
          </div>
          {drop.score != null ? (
            <div
              className="flex shrink-0 items-baseline gap-1 rounded-full border border-lime/40 bg-lime/10 px-3 py-1.5"
              title="Author's call"
            >
              <span className="text-xl font-black leading-none text-lime">{drop.score}</span>
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
          ) : null}
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
              items={items}
              renderItem={(it) =>
                it.type === 'video' ? (
                  <FeedVideo src={it.url} poster={it.posterUrl} />
                ) : (
                  <img src={it.url} alt={drop.title} loading="lazy" className="max-h-[420px] w-full object-cover" />
                )
              }
            />
          </div>
        )}

        {/* caption */}
        <div className="px-4 pt-3">
          <p className="text-[15px] leading-snug">
            <span className="font-bold">{drop.title}</span>
            {drop.description ? (
              <>
                {' '}<span className="font-bold text-lime">Hear me out — </span>
                <span className="text-fog/90">{drop.description}</span>
              </>
            ) : null}
          </p>
          {drop.category === 'recipes' && (drop.ingredients.length > 0 || drop.instructions.length > 0) && (
            <p className="mt-1 text-xs font-bold text-mute">
              Recipe · {drop.ingredients.length} ingredients · {drop.instructions.length} steps
            </p>
          )}
        </div>

        {items.length === 0 && textActions}

        <div className="px-4 pt-2">
          <LinkChips drop={drop} />
        </div>

        {showComments && (
          <div className="px-4 pt-2" onClick={(e) => e.stopPropagation()}>
            <Comments dropId={drop.id} authorId={drop.author_id} onCountChange={setCommentCount} />
          </div>
        )}
      </article>
    </Reveal>
  )
}
