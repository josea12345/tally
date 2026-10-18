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
          <button
            onClick={toggleSave}
            className={`press mt-0.5 flex shrink-0 items-center gap-1 font-bold transition ${saved ? 'text-lime' : 'text-mute hover:text-lime'}`}
            aria-label={saved ? 'Untally' : 'Tally'}
          >
            <span className={heartPop ? 'heart-pop inline-block' : 'inline-block'}>
              <TallyIcon saved={saved} className="h-5 w-5" />
            </span>
            <span className="text-xs">{formatCount(stats.saves)}</span>
          </button>
        </div>

        {drop.media_url && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-black" onClick={(e) => e.stopPropagation()}>
            {drop.media_type === 'video' ? (
              <FeedVideo src={drop.media_url} poster={drop.media_poster_url} />
            ) : (
              <img src={drop.media_url} alt={drop.title} loading="lazy" className="max-h-[260px] w-full object-cover" />
            )}
          </div>
        )}

        <div className="pt-1">
          <LinkChips drop={drop} />
        </div>

        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={(e) => castVote(e, 'W')}
              className={`press flex items-center justify-center gap-2 rounded-2xl border-2 py-3 transition ${
                myVote === 'W'
                  ? 'border-lime bg-lime text-ink'
                  : 'border-lime/50 bg-lime/10 text-lime'
              }`}
              aria-label="Vote W"
            >
              <span className={`${slam === 'W' ? 'verdict-slam' : ''} inline-block text-2xl font-black`}>W</span>
              <span className="text-lg font-black">{formatCount(stats.wins)}</span>
            </button>
            <button
              onClick={(e) => castVote(e, 'L')}
              className={`press flex items-center justify-center gap-2 rounded-2xl border-2 py-3 transition ${
                myVote === 'L'
                  ? 'border-miss bg-miss text-white'
                  : 'border-miss/50 bg-miss/10 text-miss'
              }`}
              aria-label="Vote L"
            >
              <span className={`${slam === 'L' ? 'verdict-slam' : ''} inline-block text-2xl font-black`}>L</span>
              <span className="text-lg font-black">{formatCount(stats.losses)}</span>
            </button>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/drop/${drop.id}`)
            }}
            className="press mt-2.5 flex items-center gap-1.5 text-sm font-bold text-mute transition hover:text-lime"
            aria-label="Comments"
          >
            <span className="text-base">💬</span> {formatCount(stats.comments)}
          </button>
        </div>
      </article>
    </Reveal>
  )
}
