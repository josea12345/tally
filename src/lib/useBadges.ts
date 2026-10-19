import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Drop, Verdict } from './types'
import { badgesFor, firstDropCount, type Badge } from './stats'

/** Earned badges for a profile, computed from real verdict data. Null while loading. */
export function useBadges(profileId: string | null | undefined): Badge[] | null {
  const [badges, setBadges] = useState<Badge[] | null>(null)

  useEffect(() => {
    if (!profileId) {
      setBadges(null)
      return
    }
    let live = true
    const load = async () => {
      // The author's own drops are the scope key: verdicts and saves are
      // fetched by drop id, so the badge numbers are exact no matter how
      // big the global verdicts/saves tables get.
      const { data: myDropsRows } = await supabase.from('drops').select('*').eq('author_id', profileId)
      if (!live) return
      const myDrops = (myDropsRows ?? []) as Drop[]
      const ids = myDrops.map((d) => d.id)

      let verdicts: Array<Verdict & { drop: Drop }> = []
      let saves: Array<{ drop_id: string }> = []
      if (ids.length > 0) {
        const [vRes, sRes] = await Promise.all([
          supabase.from('verdicts').select('*, drop:drops!inner(id,neighborhood)').in('drop_id', ids),
          supabase.from('saves').select('drop_id').in('drop_id', ids),
        ])
        if (!live) return
        verdicts = (vRes.data ?? []) as Array<Verdict & { drop: Drop }>
        saves = (sRes.data ?? []) as Array<{ drop_id: string }>
      }

      // "First to drop it" is inherently global: it needs the earliest drop
      // for every (title, city) pair. Scoped EXPLICITLY to the 5000 most
      // recent drops — past that scale the badge silently undercounts. The
      // exact server-side replacement is proposed (not applied) in
      // tally-audit/proposed-migrations/round2/first_drop_count.sql.
      const { data: recentDrops } = await supabase
        .from('drops')
        .select('id,author_id,title,city,created_at')
        .order('created_at', { ascending: false })
        .limit(5000)
      if (!live) return

      const savesPerDrop = new Map<string, number>()
      for (const s of saves) {
        savesPerDrop.set(s.drop_id, (savesPerDrop.get(s.drop_id) ?? 0) + 1)
      }
      const first = firstDropCount(profileId, (recentDrops ?? []) as Drop[])
      setBadges(badgesFor(myDrops, verdicts, savesPerDrop, first))
    }
    load()
    return () => {
      live = false
    }
  }, [profileId])

  return badges
}
