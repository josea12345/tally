import type { CSSProperties } from 'react'

/**
 * The TALLY signature: wins and losses drawn as classic tally-mark groups
 * (four verticals crossed by a diagonal). Wins in lime, losses in red.
 */
export default function TallyMarks({
  wins,
  losses,
  max = 25,
  className = '',
}: {
  wins: number
  losses: number
  max?: number
  className?: string
}) {
  const marks: Array<'w' | 'l'> = [
    ...Array(Math.max(0, wins)).fill('w'),
    ...Array(Math.max(0, losses)).fill('l'),
  ]
  const shown = marks.slice(0, max)
  const overflow = marks.length - shown.length
  const groups: Array<Array<'w' | 'l'>> = []
  for (let i = 0; i < shown.length; i += 5) groups.push(shown.slice(i, i + 5))

  if (groups.length === 0) return null

  return (
    <div className={`flex flex-wrap items-end gap-x-3 gap-y-2 ${className}`} aria-label={`${wins} wins, ${losses} losses`}>
      {groups.map((g, gi) => (
        <div key={gi} className="relative flex h-9 items-stretch gap-[5px]">
          {g.map((m, si) =>
            si < 4 ? (
              <span
                key={si}
                className={`tally-stroke w-[3px] rounded-full ${m === 'w' ? 'bg-lime' : 'bg-miss'}`}
                style={{ '--tally-delay': `${gi * 130 + si * 70}ms` } as CSSProperties}
              />
            ) : (
              <span
                key={si}
                className="absolute -inset-x-[3px] top-1/2"
                style={{ transform: 'rotate(-24deg)' }}
              >
                <span
                  className={`tally-stroke block h-[3px] rounded-full ${m === 'w' ? 'bg-lime' : 'bg-miss'}`}
                  style={{ '--tally-delay': `${gi * 130 + si * 70}ms` } as CSSProperties}
                />
              </span>
            ),
          )}
        </div>
      ))}
      {overflow > 0 && <span className="pb-1 text-xs font-black text-mute">+{overflow}</span>}
    </div>
  )
}
