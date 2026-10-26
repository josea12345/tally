import type { Category, Profile } from '../lib/types'
import { timeAgo } from '../lib/format'
import { goToCategory } from '../lib/categoryNav'
import { navigate } from '../App'

/**
 * The action line: "@lucia recommended a spot". The person is the
 * headline act — a drop is a recommendation from someone, not a
 * listing. The noun follows the drop's category and is tappable: it
 * lands on Discover filtered to that category ("more spots").
 */
export const ACTION_PHRASE: Record<Category, { lead: string; noun: string }> = {
  food_drink: { lead: 'recommended a', noun: 'spot' },
  places: { lead: 'recommended a', noun: 'spot' },
  shops: { lead: 'recommended a', noun: 'shop' },
  movies: { lead: 'recommended a', noun: 'movie' },
  tv: { lead: 'recommended a', noun: 'show' },
  music: { lead: 'recommended a', noun: 'song' },
  recipes: { lead: 'shared a', noun: 'recipe' },
}

export function CategoryNoun({ category }: { category: Category }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        goToCategory(category)
        navigate('/')
      }}
      className="font-bold text-sig transition hover:underline hover:underline-offset-2"
      aria-label={`See more ${ACTION_PHRASE[category].noun}s`}
    >
      {ACTION_PHRASE[category].noun}
    </button>
  )
}

/** Card variant: handle + phrase on the left, the time pushed right. */
export default function ActionByline({
  author,
  category,
  createdAt,
}: {
  author?: Profile
  category: Category
  createdAt: string
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      {author ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/profile/${author.id}`)
          }}
          className="shrink-0 font-bold transition hover:text-sig"
        >
          @{author.username}
        </button>
      ) : (
        <span className="shrink-0 font-bold">Someone</span>
      )}
      <span className="truncate">{ACTION_PHRASE[category].lead}</span>
      <CategoryNoun category={category} />
      <span className="ml-auto shrink-0 text-[13px] text-mute">{timeAgo(createdAt)}</span>
    </div>
  )
}
