import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Drop, Profile, Verdict } from '../lib/types'
import { buildLeaderboard, LEADERBOARD_MINIMUM, type LeaderboardRow } from '../lib/stats'
import { Avatar, navigate } from '../App'

/** Weekly city leaderboard: win rate over the last 7 days, 3-verdict minimum to chart. */
export default function LeaderboardRail({ city }: { city: string }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)

  useEffect(() => {
    let live = true
    const load = async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const [{ data: verdicts }, { data: drops }, { data: profiles }] = await Promise.all([
        supabase.from('verdicts').select('*').gte('created_at', since).limit(2000),
        supabase.from('drops').select('*').gte('created_at', since).limit(2000),
        supabase.from('profiles').select('*').limit(500),
      ])
      if (!live) return
      const dropById = new Map(((drops ?? []) as Drop[]).map((d) => [d.id, d]))
      const profById = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))
      const withDrops = ((verdicts ?? []) as Verdict[])
        .map((v) => ({ ...v, drop: dropById.get(v.drop_id) }))
        .filter((v): v is Verdict & { drop: Drop } => !!v.drop)
      // City filter: leaderboard is per the viewer's city (drop city match).
      const cityLower = city.trim().toLowerCase()
      const cityRows = withDrops.filter((v) => (v.drop.city ?? '').trim().toLowerCase() === cityLower)
      setRows(buildLeaderboard(profById, cityRows.length ? cityRows : withDrops, since))
    }
    load()
    return () => {
      live = false
    }
  }, [city])

  if (rows === null) {
    return (
      <div className="rounded-2xl border border-line bg-ink-2 p-4">
        <div className="mb-1 text-sm font-black">This week's tastemakers</div>
        <p className="text-xs text-mute">Loading…</p>
      </div>
    )
  }

  const charted = rows.filter((r) => r.charted).slice(0, 5)
  const onDeck = rows.filter((r) => !r.charted).slice(0, 3)

  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-4">
      <div className="mb-1 text-sm font-black">This week's tastemakers</div>
      <p className="mb-3 text-xs text-mute">
        {city} · win rate, last 7 days · {LEADERBOARD_MINIMUM}+ verdicts to chart
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-mute">
          Nobody's on the board yet — verdicts from this week will show up here.
        </p>
      ) : (
        <ol className="space-y-2">
          {charted.map((r, i) => (
            <li key={r.profile.id}>
              <button onClick={() => navigate(`/profile/${r.profile.id}`)} className="flex w-full items-center gap-3 text-left">
                <span className={`w-5 text-sm font-black ${i === 0 ? 'text-lime' : 'text-mute'}`}>{i + 1}</span>
                <Avatar url={r.profile.avatar_url} name={r.profile.display_name ?? r.profile.username} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">@{r.profile.username}</span>
                  <span className="block text-xs text-mute">
                    {Math.round(r.winRate * 100)}% · {r.verdicts} verdicts
                  </span>
                </span>
              </button>
            </li>
          ))}
          {onDeck.map((r) => (
            <li key={r.profile.id} className="flex items-center gap-3 opacity-70">
              <span className="w-5 text-xs font-bold text-mute">·</span>
              <Avatar url={r.profile.avatar_url} name={r.profile.display_name ?? r.profile.username} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">@{r.profile.username}</span>
                <span className="block text-[11px] text-mute">
                  on deck — {r.verdicts}/{LEADERBOARD_MINIMUM} verdicts
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
