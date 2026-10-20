import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, Profile, Verdict } from '../lib/types'
import { buildLeaderboard, LEADERBOARD_MINIMUM, type LeaderboardRow } from '../lib/stats'
import { fetchTrustBreakdown } from '../lib/trustData'
import { Avatar, navigate } from '../App'

/**
 * The city leaderboard, full-page: this week's tastemakers ranked by
 * Taste Score (Wilson lower bound over the last 7 days of verdicts on
 * drops in the city). Falls back to all cities when the city has no
 * charted action yet — same rule as the desktop rail.
 */
export default function Leaderboard({ city = 'Miami' }: { city?: string }) {
  const { user } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [trust, setTrust] = useState<Map<string, number>>(new Map())
  const [scopedCity, setScopedCity] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const load = async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const followsPromise = user
        ? supabase.from('follows').select('followee_id').eq('follower_id', user.id).limit(2000)
        : Promise.resolve({ data: [] as Array<{ followee_id: string }> })
      const [{ data: verdicts }, { data: drops }, { data: profiles }, { data: follows }] = await Promise.all([
        supabase.from('verdicts').select('*').gte('created_at', since).limit(2000),
        supabase.from('drops').select('*').gte('created_at', since).limit(2000),
        supabase.from('profiles').select('*').limit(500),
        followsPromise,
      ])
      if (!live) return
      const dropById = new Map(((drops ?? []) as Drop[]).map((d) => [d.id, d]))
      const followingIds = new Set(((follows ?? []) as Array<{ followee_id: string }>).map((f) => f.followee_id))
      const visible = ((profiles ?? []) as Profile[]).filter(
        (p) => !p.is_private || p.id === user?.id || followingIds.has(p.id),
      )
      const profById = new Map(visible.map((p) => [p.id, p]))
      const withDrops = ((verdicts ?? []) as Verdict[])
        .map((v) => ({ ...v, drop: dropById.get(v.drop_id) }))
        .filter((v): v is Verdict & { drop: Drop } => !!v.drop)
      const cityLower = city.trim().toLowerCase()
      const cityRows = withDrops.filter((v) => (v.drop.city ?? '').trim().toLowerCase() === cityLower)
      const useCity = cityRows.length > 0
      setScopedCity(useCity ? city : null)
      setRows(buildLeaderboard(profById, useCity ? cityRows : withDrops, since))
    }
    load()
    return () => {
      live = false
    }
  }, [city, user?.id])

  // Trust for the podium only — it's a multi-query computation per author.
  useEffect(() => {
    if (!rows) return
    let live = true
    const top = rows.filter((r) => r.charted).slice(0, 5)
    ;(async () => {
      const entries = await Promise.all(
        top.map(async (r) => {
          const bd = await fetchTrustBreakdown(r.profile.id)
          return bd ? ([r.profile.id, bd.score] as const) : null
        }),
      )
      if (!live) return
      setTrust(new Map(entries.filter((e): e is readonly [string, number] => !!e)))
    })()
    return () => {
      live = false
    }
  }, [rows])

  const charted = (rows ?? []).filter((r) => r.charted).slice(0, 25)
  const onDeck = (rows ?? []).filter((r) => !r.charted).slice(0, 5)

  return (
    <div className="px-4 pb-10 pt-5">
      <button onClick={() => navigate('/')} className="text-sm font-bold text-mute transition hover:text-sig">
        ← Put Ons
      </button>
      <h1 className="mt-3 text-2xl font-black tracking-tight">
        {scopedCity ?? 'Top'} tastemakers
      </h1>
      <p className="mt-1 text-sm text-mute">
        Ranked by Taste Score from this week's verdicts
        {scopedCity ? ` on ${scopedCity} drops` : ''}. {LEADERBOARD_MINIMUM}+ verdicts to chart.
      </p>

      {rows === null ? (
        <div className="mt-6 animate-pulse space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-ink-3" />
          ))}
        </div>
      ) : charted.length === 0 && onDeck.length === 0 ? (
        <p className="mt-8 text-center text-sm text-mute">
          No verdicts yet this week — the board is wide open. Drop something and get judged.
        </p>
      ) : (
        <>
          <ul className="mt-6 space-y-2.5">
            {charted.map((r, i) => (
              <li key={r.profile.id}>
                <button
                  onClick={() => navigate(`/profile/${r.profile.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-ink-2 p-3 text-left transition hover:border-sig/50"
                >
                  <span
                    className={`w-7 shrink-0 text-center text-lg font-black ${
                      i === 0 ? 'text-butter' : i === 1 ? 'text-fog' : i === 2 ? 'text-lilac' : 'text-mute'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <Avatar url={r.profile.avatar_url} name={r.profile.display_name ?? r.profile.username} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {r.profile.display_name || `@${r.profile.username}`}{' '}
                      <span className="font-normal text-mute">@{r.profile.username}</span>
                    </span>
                    <span className="block text-xs text-mute">
                      <span className="font-bold text-win">{r.wins} W</span> ·{' '}
                      <span className="font-bold text-miss">{r.losses} L</span> this week
                      {trust.has(r.profile.id) && (
                        <span className="font-bold text-[#69e7cf]"> · Trust {trust.get(r.profile.id)}</span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xl font-black tabular-nums text-sig">{r.score}</span>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-mute">Taste</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {onDeck.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">On deck</h2>
              <ul className="space-y-2.5">
                {onDeck.map((r) => (
                  <li
                    key={r.profile.id}
                    className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-ink-2/60 p-3"
                  >
                    <Avatar url={r.profile.avatar_url} name={r.profile.display_name ?? r.profile.username} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">@{r.profile.username}</span>
                      <span className="block text-xs text-mute">
                        {r.verdicts} of {LEADERBOARD_MINIMUM} verdicts needed to chart
                      </span>
                    </span>
                    <span className="text-xs font-bold text-mute">
                      {r.wins} W · {r.losses} L
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
