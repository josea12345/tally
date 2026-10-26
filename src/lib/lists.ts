import { supabase } from './supabase'
import type { Collection, Profile } from './types'

/**
 * Posted lists (Jose's spec, 2026-10-26): a list IS a collection (0041)
 * presented as its own section — never rated (no 0–10, ever), no Try-all,
 * no share button. Its one social signal is the mountain like (0053):
 * tap the peak, the count is the list's popularity.
 */

export interface ListSummary extends Collection {
  owner: Profile | null
  dropCount: number
  likeCount: number
  likedByMe: boolean
  covers: string[]
}

/** Batch like state for a set of lists: counts + which ones I liked. */
export async function likeStateFor(
  listIds: string[],
  myId: string | null,
): Promise<Map<string, { count: number; mine: boolean }>> {
  const out = new Map<string, { count: number; mine: boolean }>()
  if (listIds.length === 0) return out
  const { data } = await supabase
    .from('collection_likes')
    .select('collection_id, user_id')
    .in('collection_id', listIds)
    .limit(5000)
  for (const r of (data ?? []) as Array<{ collection_id: string; user_id: string }>) {
    const cur = out.get(r.collection_id) ?? { count: 0, mine: false }
    cur.count += 1
    if (myId && r.user_id === myId) cur.mine = true
    out.set(r.collection_id, cur)
  }
  return out
}

/** Item counts + up to 3 cover images per list, from one items query. */
async function itemInfoFor(
  listIds: string[],
): Promise<Map<string, { count: number; covers: string[] }>> {
  const out = new Map<string, { count: number; covers: string[] }>()
  if (listIds.length === 0) return out
  const { data } = await supabase
    .from('collection_items')
    .select(
      'collection_id, position, drop:drops!collection_items_drop_id_fkey(media_url, media_type, media_poster_url, media_items)',
    )
    .in('collection_id', listIds)
    .order('position', { ascending: true })
    .limit(3000)
  type Row = {
    collection_id: string
    drop: {
      media_url: string | null
      media_type: string | null
      media_poster_url: string | null
      media_items: Array<{ url: string; type: string; posterUrl?: string | null }> | null
    } | null
  }
  for (const r of (data ?? []) as unknown as Row[]) {
    const cur = out.get(r.collection_id) ?? { count: 0, covers: [] }
    cur.count += 1
    if (cur.covers.length < 3 && r.drop) {
      const first = r.drop.media_items?.[0]
      const url =
        first?.type === 'video'
          ? first.posterUrl ?? null
          : first?.url ?? (r.drop.media_type === 'video' ? r.drop.media_poster_url : r.drop.media_url)
      if (url) cur.covers.push(url)
    }
    out.set(r.collection_id, cur)
  }
  return out
}

/** Public lists for the Lists section, most-liked first (popularity is the rank). */
export async function fetchPublicLists(myId: string | null, limit = 50): Promise<ListSummary[]> {
  const { data } = await supabase
    .from('collections')
    .select('*, owner:profiles!collections_owner_id_fkey(*)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  const cols = (data ?? []) as Array<Collection & { owner: Profile | null }>
  if (cols.length === 0) return []
  const ids = cols.map((c) => c.id)
  const [likes, items] = await Promise.all([likeStateFor(ids, myId), itemInfoFor(ids)])
  return cols
    .map((c) => ({
      ...c,
      owner: c.owner ?? null,
      dropCount: items.get(c.id)?.count ?? 0,
      covers: items.get(c.id)?.covers ?? [],
      likeCount: likes.get(c.id)?.count ?? 0,
      likedByMe: likes.get(c.id)?.mine ?? false,
    }))
    .sort((a, b) => b.likeCount - a.likeCount || +new Date(b.created_at) - +new Date(a.created_at))
}

/** One list's summary (detail page header, like row). */
export async function fetchListSummary(id: string, myId: string | null): Promise<ListSummary | null> {
  const { data } = await supabase
    .from('collections')
    .select('*, owner:profiles!collections_owner_id_fkey(*)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const c = data as Collection & { owner: Profile | null }
  const [likes, items] = await Promise.all([likeStateFor([id], myId), itemInfoFor([id])])
  return {
    ...c,
    owner: c.owner ?? null,
    dropCount: items.get(id)?.count ?? 0,
    covers: items.get(id)?.covers ?? [],
    likeCount: likes.get(id)?.count ?? 0,
    likedByMe: likes.get(id)?.mine ?? false,
  }
}
