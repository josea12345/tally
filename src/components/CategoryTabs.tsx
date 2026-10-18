import type { Category } from '../lib/types'
import { ALL_CATEGORIES, CATEGORY_LABELS } from '../lib/types'

export default function CategoryTabs({
  value,
  onChange,
  includeAll = true,
}: {
  value: Category | 'all'
  onChange: (c: Category | 'all') => void
  includeAll?: boolean
}) {
  return (
    <div className="rail-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {includeAll && (
        <Tab active={value === 'all'} onClick={() => onChange('all')} label="Everything" />
      )}
      {ALL_CATEGORIES.map((c) => (
        <Tab key={c} active={value === c} onClick={() => onChange(c)} label={CATEGORY_LABELS[c]} />
      ))}
    </div>
  )
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? 'bg-lime text-ink' : 'border border-line bg-ink-2 text-mute hover:text-fog'
      }`}
    >
      {label}
    </button>
  )
}
