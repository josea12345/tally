import { useState } from 'react'
import type { Drop, DropStats } from '../lib/types'
import { timeAgo, formatCount } from '../lib/format'
import { Avatar, navigate } from '../App'
import LinkChips from './LinkChips'
import Reveal from './Reveal'
import FeedVideo from './FeedVideo'
import TallyIcon from './TallyIcon'

interface Props {
  drop: Drop
  stats: DropStats
  saved: boolean
  onToggleSave: () => void
  myVote: 'W' | 'L' | null
  onVote: (v: 'W' | 'L') => void
  revealDelay?: number
}

export default function DropCard({ drop, stats, saved, onToggleSave, myVote, onVote, revealDelay = 0 }: Props) {
  const author = drop.author
  const open = () => navigate(`/drop/${drop.id}`)
  const [heartPop, setHeartPop] = useState(false)
  const [slam, setSlam] = useState<'W' | 'L' | null>(null)

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

  return (
    <Reveal delay={revealDelay}>
      <article
        onClick={open}
        className="cursor-pointer border-b border-line px-4 pb-3 pt-4 transition hover:bg-ink-2/60"
      >
        <div className="flex gap-3">
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

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-display text-[17px] font-bold leading-snug tracking-tight">{drop.title}</h3>
              {drop.score != null && (
                <span className="inline-flex items-center gap-1 rounded-full border border-lime/50 bg-lime/10 px-2 py-px">
                  <span className="text-xs font-black text-lime">{drop.score}</span>
                  <span className="text-[9px] font-bold text-mute">/10 author's call</span>
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[15px] leading-snug text-fog/90">
              <span className="font-bold text-lime">Hear me out — </span>
              {drop.description}
            </p>
          </div>
        </div>

        {drop.media_url ? (
          <div className="relative mt-3 overflow-hidden rounded-2xl border border-line bg-black" onClick={(e) => e.stopPropagation()}>
            {drop.media_type === 'video' ? (
              <FeedVideo src={drop.media_url} poster={drop.media_poster_url} />
            ) : (
              <img src={drop.media_url} alt={drop.title} loading="lazy" className="max-h-[260px] w-full object-cover" />
            )}
            {/* TikTok-style action rail, overlaid on the media */}
            <div className="absolute bottom-2.5 right-2.5 flex flex-col items-center gap-4">
              <button
                onClick={toggleSave}
                aria-label={saved ? 'Untally' : 'Tally'}
                className="press flex flex-col items-center gap-1"
              >
                <span className={`${heartPop ? 'heart-pop' : ''} inline-block drop-shadow-lg ${saved ? 'text-lime' : 'text-white'}`}>
                  <TallyIcon saved={saved} className="h-7 w-7" />
                </span>
                <span className="text-[11px] font-bold text-white drop-shadow-md">{formatCount(stats.saves)}</span>
              </button>
              <button
                onClick={(e) => castVote(e, 'W')}
                aria-label="Vote W"
                className="press flex flex-col items-center gap-1"
              >
                <span className={`${slam === 'W' ? 'verdict-slam' : ''} inline-block text-[22px] font-black leading-none drop-shadow-lg ${myVote === 'W' ? 'text-lime' : 'text-white'}`}>W</span>
                <span className="text-[11px] font-bold text-white drop-shadow-md">{formatCount(stats.wins)}</span>
              </button>
              <button
                onClick={(e) => castVote(e, 'L')}
                aria-label="Vote L"
                className="press flex flex-col items-center gap-1"
              >
                <span className={`${slam === 'L' ? 'verdict-slam' : ''} inline-block text-[22px] font-black leading-none drop-shadow-lg ${myVote === 'L' ? 'text-miss' : 'text-white'}`}>L</span>
                <span className="text-[11px] font-bold text-white drop-shadow-md">{formatCount(stats.losses)}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/drop/${drop.id}`)
                }}
                aria-label="Comments"
                className="press flex flex-col items-center gap-1"
              >
                <span className="text-[22px] leading-none drop-shadow-lg">💬</span>
                <span className="text-[11px] font-bold text-white drop-shadow-md">{formatCount(stats.comments)}</span>
              </button>
            </div>
          </div>
        ) : (
          /* text-only drop: compact action row below */
          <div className="mt-3 flex items-center gap-5 text-sm">
            <button
              onClick={toggleSave}
              aria-label={saved ? 'Untally' : 'Tally'}
              className={`press flex items-center gap-1.5 font-bold transition ${saved ? 'text-lime' : 'text-mute hover:text-lime'}`}
            >
              <span className={heartPop ? 'heart-pop inline-block' : 'inline-block'}>
                <TallyIcon saved={saved} className="h-4 w-4" />
              </span>
              {formatCount(stats.saves)}
            </button>
            <button
              onClick={(e) => castVote(e, 'W')}
              aria-label="Vote W"
              className={`press flex items-center gap-1.5 font-bold transition ${myVote === 'W' ? 'text-lime' : 'text-mute hover:text-lime'}`}
            >
              <span className={`${slam === 'W' ? 'verdict-slam' : ''} inline-block text-[15px] font-black`}>W</span>
              {formatCount(stats.wins)}
            </button>
            <button
              onClick={(e) => castVote(e, 'L')}
              aria-label="Vote L"
              className={`press flex items-center gap-1.5 font-bold transition ${myVote === 'L' ? 'text-miss' : 'text-mute hover:text-miss'}`}
            >
              <span className={`${slam === 'L' ? 'verdict-slam' : ''} inline-block text-[15px] font-black`}>L</span>
              {formatCount(stats.losses)}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/drop/${drop.id}`)
              }}
              aria-label="Comments"
              className="press flex items-center gap-1.5 font-bold text-mute transition hover:text-lime"
            >
              <span className="text-base">💬</span> {formatCount(stats.comments)}
            </button>
          </div>
        )}

        <div className="pt-1">
          <LinkChips drop={drop} />
        </div>
      </article>
    </Reveal>
  )
}
