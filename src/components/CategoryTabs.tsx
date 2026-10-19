import type { Category } from '../lib/types'
import { CATEGORY_GROUPS } from '../lib/types'

/** Leaf labels inside the sub-row — "Spots" disambiguates from the group name. */
const SUB_LABELS: Record<Category, string> = {
  food_drink: 'Spots',
  recipes: 'Recipes',
  places: 'Places',
  shops: 'Shops',
  movies: 'Movies',
  tv: 'TV Shows',
  music: 'Music',
}

/**
 * Two-row filter: groups on top, subcategories beneath the active group.
 * Tapping a group resets the subcategory to All.
 */
export default function CategoryTabs({
  group,
  sub,
  onGroup,
  onSub,
}: {
  group: string
  sub: Category | 'all'
  onGroup: (id: string) => void
  onSub: (c: Category | 'all') => void
}) {
  const active = CATEGORY_GROUPS.find((g) => g.id === group)
  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5 pb-1">
        <Tab active={group === 'all'} onClick={() => onGroup('all')} label="All" />
        {CATEGORY_GROUPS.map((g) => (
          <Tab key={g.id} active={group === g.id} onClick={() => onGroup(g.id)} label={g.label} />
        ))}
      </div>
      {active && (
        <div className="rail-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pt-1.5">
          <SubTab active={sub === 'all'} onClick={() => onSub('all')} label={`All ${active.label}`} />
          {active.categories.map((c) => (
            <SubTab key={c} active={sub === c} onClick={() => onSub(c)} label={SUB_LABELS[c]} />
          ))}
        </div>
      )}
    </div>
  )
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      key={active ? 'on' : 'off'}
      onClick={onClick}
      className={`press min-w-0 truncate rounded-full px-2 py-1.5 text-[11px] font-bold tracking-tight transition ${
        active
          ? 'tab-flash tab-glow bg-sig text-[var(--color-sig-ink)]'
          : 'border border-line bg-ink-2 text-mute hover:text-fog'
      }`}
    >
      {label}
    </button>
  )
}

function SubTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      key={active ? 'on' : 'off'}
      onClick={onClick}
      className={`press shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${
        active
          ? 'tab-flash tab-glow bg-sig text-[var(--color-sig-ink)]'
          : 'border border-line bg-ink-2 text-mute hover:text-fog'
      }`}
    >
      {label}
    </button>
  )
}
