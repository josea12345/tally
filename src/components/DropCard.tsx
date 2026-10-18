import { useState } from 'react'
import type { Drop, DropStats } from '../lib/types'
import { timeAgo, formatCount } from '../lib/format'
import { Avatar, navigate } from '../App'
import LinkChips from './LinkChips'
import Reveal from './Reveal'
import FeedVideo from './FeedVideo'

interface Props {
  drop: Drop
  stats: DropStats
  saved: boolean
  onToggleSave: () => void
  revealDelay?: number
}

export default function DropCard({ drop, stats, saved, onToggleSave, revealDelay = 0 }: Props) {
  const author = drop.author
  const open = () => navigate(`/drop/${drop.id}`)
  const [heartPop, setHeartPop] = useState(false)

  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!saved) {
      setHeartPop(false)
      requestAnimationFrame(() => setHeartPop(true))
    }
    onToggleSave()
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

        <div className="mt-2.5 flex items-center gap-5 text-sm">
          <button
            onClick={toggleSave}
            className={`press flex items-center gap-1.5 font-bold transition ${saved ? 'text-lime' : 'text-mute hover:text-lime'}`}
            aria-label={saved ? 'Unsave' : 'Save'}
          >
            <span className={`text-lg ${heartPop && saved ? 'heart-pop' : ''}`}>{saved ? '♥' : '♡'}</span>
            <span>{formatCount(stats.saves)}</span>
          </button>
          <span className="flex items-center gap-1.5 font-bold text-mute">
            <span className="text-lime">▲</span> {formatCount(stats.wins)}
          </span>
          <span className="flex items-center gap-1.5 font-bold text-mute">
            <span className="text-miss">▼</span> {formatCount(stats.losses)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/drop/${drop.id}`)
            }}
            className="press flex items-center gap-1.5 font-bold text-mute transition hover:text-lime"
            aria-label="Comments"
          >
            <span className="text-base">💬</span> {formatCount(stats.comments)}
          </button>
        </div>
      </article>
    </Reveal>
  )
}
