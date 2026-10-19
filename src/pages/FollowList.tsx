import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../lib/types'
import { Avatar, navigate } from '../App'
import FollowButton from '../components/FollowButton'
import EmptyState from '../components/EmptyState'

type Kind = 'followers' | 'following'

interface Row {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

/** Tappable followers / following lists with tabs to switch. */
export default function FollowList({ profileId, kind }: { profileId: string; kind: Kind }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Kind>(kind)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowingOwner, setIsFollowingOwner] = useState(false)

  useEffect(() => {
    setTab(kind)
  }, [kind, profileId])

  useEffect(() => {
    let live = true
    const load = async () => {
      setLoading(true)
      const [{ data: p }, { data: rel }] = await Promise.all([
        supabase.from('profiles').select('id,username,display_name,is_private').eq('id', profileId).maybeSingle(),
        tab === 'followers'
          ? supabase
              .from('follows')
              .select('follower:profiles!follows_follower_id_fkey(id,username,display_name,avatar_url)')
              .eq('followee_id', profileId)
              .order('created_at', { ascending: false })
          : supabase
              .from('follows')
              .select('followee:profiles!follows_followee_id_fkey(id,username,display_name,avatar_url)')
              .eq('follower_id', profileId)
              .order('created_at', { ascending: false }),
      ])
      if (!live) return
      setOwner((p ?? null) as Profile | null)
      const list = ((rel ?? []) as Array<{ follower?: Row | null; followee?: Row | null }>)
        .map((r) => (tab === 'followers' ? r.follower : r.followee))
        .filter((x): x is Row => !!x)
      setRows(list)
      if (user && p) {
        const { count } = await supabase
          .from('follows')
          .select('id', { count: 'exact', head: true })
          .eq('follower_id', user.id)
          .eq('followee_id', profileId)
        if (live) setIsFollowingOwner((count ?? 0) > 0)
      }
      setLoading(false)
    }
    load()
    return () => {
      live = false
    }
  }, [profileId, tab, user])

  const isOwn = user?.id === profileId
  const locked = !!owner?.is_private && !isOwn && !isFollowingOwner

  return (
    <div className="pb-8">
      <div className="pt-safe sticky top-0 z-30 border-b border-line bg-ink/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => navigate(`/profile/${profileId}`)}
            aria-label="Back to profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-lg text-fog"
          >
            ←
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-black">@{owner?.username ?? '…'}</div>
          </div>
        </div>
        <div className="flex gap-1 rounded-full bg-ink-3 p-1">
          {(['followers', 'following'] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-full py-1.5 text-sm font-black capitalize transition ${
                tab === k ? 'bg-sig text-ink' : 'text-mute hover:text-fog'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-2">
        {loading ? (
          <p className="py-8 text-center text-sm text-mute">Loading…</p>
        ) : locked ? (
          <div className="py-14 text-center">
            <p className="text-sm font-bold">This account is private.</p>
            <p className="mt-1 text-xs text-mute">Follow @{owner?.username} to see their {tab}.</p>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            mood="happy"
            title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            body={tab === 'followers' ? 'When people follow, they show up here.' : 'Accounts you follow show up here.'}
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <button onClick={() => navigate(`/profile/${r.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar url={r.avatar_url} name={r.display_name ?? r.username} size={44} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{r.display_name || `@${r.username}`}</span>
                    <span className="block truncate text-xs text-mute">@{r.username}</span>
                  </span>
                </button>
                {user && r.id !== user.id && <FollowButton followeeId={r.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
