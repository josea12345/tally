import { supabase } from './supabase'

/**
 * Media uploads get UUID filenames that are written once and never
 * change, so every object can be cached for a year: browsers and the
 * CDN serve repeat views locally instead of re-downloading the file
 * (which is what storage egress bills). Avatars are the exception —
 * they reuse a fixed filename, so they keep the default short cache.
 */
export const IMMUTABLE_CACHE_CONTROL = '31536000'

type StorageKey = { bucket: string; path: string }

/** Parse a Supabase public storage URL into its bucket + object path.
 *  Returns null for anything that isn't one of our storage URLs
 *  (external links, Deezer/TMDB art, taste-card renders...). */
export function storageKeyFromUrl(url: string): StorageKey | null {
  const m = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url)
  if (!m) return null
  const path = m[2].split(/[?#]/)[0]
  if (!path) return null
  try {
    return { bucket: m[1], path: decodeURIComponent(path) }
  } catch {
    return { bucket: m[1], path }
  }
}

type MediaFields = {
  media_url?: string | null
  media_urls?: string[] | null
  media_poster_url?: string | null
  media_poster_urls?: (string | null)[] | null
}

export function dropMediaKeys(drop: MediaFields): StorageKey[] {
  const urls = [
    drop.media_url,
    ...(drop.media_urls ?? []),
    drop.media_poster_url,
    ...(drop.media_poster_urls ?? []),
  ]
  const seen = new Set<string>()
  const keys: StorageKey[] = []
  for (const u of urls) {
    if (!u) continue
    const key = storageKeyFromUrl(u)
    if (!key) continue
    const id = `${key.bucket}/${key.path}`
    if (seen.has(id)) continue
    seen.add(id)
    keys.push(key)
  }
  return keys
}

/**
 * Best-effort removal of the storage files behind a set of public
 * URLs, grouped by bucket. Never throws — file cleanup must not block
 * the action that triggered it (deleting a drop, swapping a proof).
 */
export async function removeStorageByUrls(urls: (string | null | undefined)[]): Promise<void> {
  const byBucket = new Map<string, string[]>()
  for (const u of urls) {
    if (!u) continue
    const key = storageKeyFromUrl(u)
    if (!key) continue
    const list = byBucket.get(key.bucket) ?? []
    list.push(key.path)
    byBucket.set(key.bucket, list)
  }
  await Promise.all(
    [...byBucket.entries()].map(async ([bucket, paths]) => {
      try {
        await supabase.storage.from(bucket).remove(paths)
      } catch {
        /* best effort */
      }
    }),
  )
}

/**
 * Remove every storage file a drop points at — its media, posters,
 * and any verdict proof photos attached to it. Call AFTER the drop
 * row is deleted; verdict proofs are fetched before the delete
 * because their rows cascade away with the drop.
 */
export async function deleteDropFiles(
  drop: MediaFields & { id: string },
  extraUrls: (string | null | undefined)[] = [],
): Promise<void> {
  const urls = [
    drop.media_url,
    ...(drop.media_urls ?? []),
    drop.media_poster_url,
    ...(drop.media_poster_urls ?? []),
    ...extraUrls,
  ]
  await removeStorageByUrls(urls)
}

/** Verdict proof URLs for a drop (fetched before the drop is deleted). */
export async function fetchVerdictProofUrls(dropId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('verdicts')
      .select('proof_url')
      .eq('drop_id', dropId)
      .not('proof_url', 'is', null)
    return (data ?? []).map((r) => r.proof_url as string)
  } catch {
    return []
  }
}
