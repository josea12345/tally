import type { ListSummary } from '../lib/lists'
import { Avatar, navigate } from '../App'
import ListLikeButton from './ListLikeButton'

/**
 * A posted list in the Lists section: title, owner, the first few
 * covers of its ordered drops, and the mountain like — the list's
 * only signal. Deliberately NOT a DropCard: no rating, no Try, no
 * share (Jose's spec, 2026-10-26).
 */
export default function ListCard({ list }: { list: ListSummary }) {
  const preview = list.covers.slice(0, 3)
  return (
    <div className="border-b border-line px-4 py-4">
      <button onClick={() => navigate(`/list/${list.id}`)} className="block w-full text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-display text-[19px] font-bold leading-snug">{list.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-mute">
              {list.owner && (
                <>
                  <Avatar url={list.owner.avatar_url} name={list.owner.display_name ?? list.owner.username} size={16} />
                  <span className="font-bold text-fog">@{list.owner.username}</span>
                </>
              )}
              <span>· {list.dropCount} drop{list.dropCount === 1 ? '' : 's'}</span>
            </span>
          </span>
        </span>
        {preview.length > 0 && (
          <span className="mt-3 flex gap-1.5">
            {preview.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                loading="lazy"
                className="h-20 w-20 rounded-xl border border-line object-cover"
              />
            ))}
            {list.dropCount > 3 && (
              <span className="flex h-20 w-20 items-center justify-center rounded-xl border border-line bg-ink-2 text-sm font-black text-mute">
                +{list.dropCount - 3}
              </span>
            )}
          </span>
        )}
      </button>
      <div className="mt-3">
        <ListLikeButton listId={list.id} ownerId={list.owner_id} count={list.likeCount} liked={list.likedByMe} />
      </div>
    </div>
  )
}
