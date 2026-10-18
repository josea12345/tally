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
      const [{ data: myDrops }, { data: allDrops }, { data: verdicts }, { data: saves }] = await Promise.all([
        supabase.from('drops').select('*').eq('author_id', profileId),
        supabase.from('drops').select('id,author_id,title,city,created_at').limit(5000),
        supabase.from('verdicts').select('*, drop:drops!inner(id,neighborhood)').limit(5000),
        supabase.from('saves').select('drop_id').limit(5000),
      ])
      if (!live) return
      const mine = new Set(((myDrops ?? []) as Drop[]).map((d) => d.id))
      const received = ((verdicts ?? []) as Array<Verdict & { drop: Drop }>).filter((v) =>
        mine.has(v.drop_id)
      )
      const savesPerDrop = new Map<string, number>()
      for (const s of (saves ?? []) as Array<{ drop_id: string }>) {
        if (!mine.has(s.drop_id)) continue
        savesPerDrop.set(s.drop_id, (savesPerDrop.get(s.drop_id) ?? 0) + 1)
      }
      const first = firstDropCount(profileId, (allDrops ?? []) as Drop[])
      setBadges(badgesFor((myDrops ?? []) as Drop[], received, savesPerDrop, first))
    }
    load()
    return () => {
      live = false
    }
  }, [profileId])

  return badges
}
