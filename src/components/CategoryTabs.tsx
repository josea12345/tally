import { CATEGORY_GROUPS } from '../lib/types'

/** Discover filter row: Everything + the three buckets. Four pills, no scroll maze. */
export default function CategoryTabs({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="rail-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <Tab active={value === 'all'} onClick={() => onChange('all')} label="Everything" />
      {CATEGORY_GROUPS.map((g) => (
        <Tab key={g.id} active={value === g.id} onClick={() => onChange(g.id)} label={g.label} />
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
