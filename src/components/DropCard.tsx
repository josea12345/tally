import type { Drop, DropStats } from '../lib/types'
import { timeAgo, formatCount } from '../lib/format'
import { Avatar, navigate } from '../App'
import LinkChips from './LinkChips'

interface Props {
  drop: Drop
  stats: DropStats
  saved: boolean
  onToggleSave: () => void
}

export default function DropCard({ drop, stats, saved, onToggleSave }: Props) {
  const author = drop.author
  const open = () => navigate(`/drop/${drop.id}`)

  return (
    <article
      onClick={open}
      className="rise-in cursor-pointer border-b border-line px-4 py-4 transition hover:bg-ink-2/60"
    >
      <div className="flex gap-3">
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => author && navigate(`/profile/${author.id}`)}
            aria-label={author ? `Open @${author.username}` : 'profile'}
          >
            <Avatar url={author?.avatar_url ?? null} name={author?.display_name ?? author?.username ?? '?'} size={44} />
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

          <h3 className="mt-1 text-lg font-black leading-snug">{drop.title}</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-fog/90">
            <span className="font-bold text-lime">Hear me out — </span>
            {drop.description}
          </p>
          {(drop.street_address || drop.neighborhood || drop.city) && (
            <p className="mt-1 text-xs text-mute">
              {[drop.street_address, drop.neighborhood, drop.city].filter(Boolean).join(' · ')}
            </p>
          )}

          {drop.media_url && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-line">
              {drop.media_type === 'video' ? (
                <video src={drop.media_url} controls playsInline preload="metadata" className="max-h-96 w-full bg-black" />
              ) : (
                <img src={drop.media_url} alt={drop.title} loading="lazy" className="max-h-96 w-full object-cover" />
              )}
            </div>
          )}

          <LinkChips drop={drop} />

          <div className="mt-3 flex items-center gap-5 text-sm">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleSave()
              }}
              className={`flex items-center gap-1.5 font-bold transition ${saved ? 'text-lime' : 'text-mute hover:text-lime'}`}
              aria-label={saved ? 'Unsave' : 'Save'}
            >
              <span className="text-lg">{saved ? '♥' : '♡'}</span>
              <span>{formatCount(stats.saves)}</span>
            </button>
            <span className="flex items-center gap-1.5 font-bold text-mute">
              <span className="text-lime">▲</span> {formatCount(stats.hits)}
            </span>
            <span className="flex items-center gap-1.5 font-bold text-mute">
              <span className="text-miss">▼</span> {formatCount(stats.misses)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                const url = `${window.location.origin}${window.location.pathname}#/drop/${drop.id}`
                navigator.clipboard?.writeText(url).catch(() => {})
              }}
              className="ml-auto text-mute transition hover:text-lime"
              aria-label="Copy link"
            >
              ⤴
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
