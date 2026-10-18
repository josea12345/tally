import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, navigate } from '../App'
import { notify } from '../lib/notify'
import { useBadges } from '../lib/useBadges'

interface FollowRequest {
  follower_id: string
  created_at: string
  follower: { username: string; display_name: string | null; avatar_url: string | null }
}

export default function Settings() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const [isPrivate, setIsPrivate] = useState(profile?.is_private ?? false)
  const [requests, setRequests] = useState<FollowRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>(profile?.dismissed_badges ?? [])
  const badges = useBadges(user?.id)

  const restoreBadge = async (id: string) => {
    if (!user) return
    const next = dismissed.filter((d) => d !== id)
    setDismissed(next)
    await supabase.from('profiles').update({ dismissed_badges: next }).eq('id', user.id)
    refreshProfile()
  }

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    setIsPrivate(profile?.is_private ?? false)
    setDismissed(profile?.dismissed_badges ?? [])
    let live = true
    supabase
      .from('follow_requests')
      .select('follower_id, created_at, follower:profiles!follow_requests_follower_id_fkey(username, display_name, avatar_url)')
      .eq('followee_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (live) setRequests((data ?? []) as FollowRequest[])
      })
    return () => {
      live = false
    }
  }, [user])

  const togglePrivate = async () => {
    if (!user || busy) return
    setBusy(true)
    try {
      const next = !isPrivate
      const { error } = await supabase.from('profiles').update({ is_private: next }).eq('id', user.id)
      if (error) throw error
      if (!next) {
        // Going public: approve every pending request.
        for (const r of requests) {
          await supabase.from('follows').insert({ follower_id: r.follower_id, followee_id: user.id })
          void notify(r.follower_id, user.id, 'approved')
        }
        await supabase.from('follow_requests').delete().eq('followee_id', user.id)
        setRequests([])
      }
      setIsPrivate(next)
      await refreshProfile()
    } catch {
      // Likely migration 0008 hasn't been run yet.
    } finally {
      setBusy(false)
    }
  }

  const approve = async (r: FollowRequest) => {
    if (!user) return
    const { error: fErr } = await supabase
      .from('follows')
      .insert({ follower_id: r.follower_id, followee_id: user.id })
    if (fErr) return
    await supabase.from('follow_requests').delete().eq('follower_id', r.follower_id).eq('followee_id', user.id)
    void notify(r.follower_id, user.id, 'approved')
    setRequests((rs) => rs.filter((x) => x.follower_id !== r.follower_id))
  }

  const deny = async (r: FollowRequest) => {
    if (!user) return
    await supabase.from('follow_requests').delete().eq('follower_id', r.follower_id).eq('followee_id', user.id)
    setRequests((rs) => rs.filter((x) => x.follower_id !== r.follower_id))
  }

  const logout = async () => {
    setLeaving(true)
    await signOut()
    navigate('/')
  }

  if (!user) return null

  return (
    <div className="pb-8">
      <div className="border-b border-line px-4 pb-3 pt-5">
        <h1 className="text-2xl font-black tracking-tight">Settings</h1>
      </div>

      {/* privacy */}
      <section className="px-4 pt-6">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Privacy</h2>
        <div className="rounded-3xl border border-line bg-ink-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold">Private account</div>
              <p className="mt-0.5 text-xs leading-relaxed text-mute">
                Only followers can see your drops. New followers need your approval.
              </p>
            </div>
            <button
              onClick={togglePrivate}
              disabled={busy}
              role="switch"
              aria-checked={isPrivate}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${isPrivate ? 'bg-lime' : 'bg-ink-3'}`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${isPrivate ? 'left-7' : 'left-1'}`}
              />
            </button>
          </div>
        </div>

        {isPrivate && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-black">
              Follow requests {requests.length > 0 && <span className="text-lime">· {requests.length}</span>}
            </h3>
            {requests.length === 0 ? (
              <p className="rounded-2xl border border-line bg-ink-2 p-4 text-sm text-mute">No pending requests.</p>
            ) : (
              <ul className="space-y-2">
                {requests.map((r) => (
                  <li key={r.follower_id} className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 p-3">
                    <Avatar url={r.follower.avatar_url} name={r.follower.display_name ?? r.follower.username} size={40} />
                    <button onClick={() => navigate(`/profile/${r.follower_id}`)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-bold">
                        {r.follower.display_name || `@${r.follower.username}`}{' '}
                        <span className="font-normal text-mute">@{r.follower.username}</span>
                      </div>
                    </button>
                    <button
                      onClick={() => approve(r)}
                      className="rounded-full bg-lime px-4 py-1.5 text-xs font-black text-ink"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => deny(r)}
                      className="rounded-full border border-line px-4 py-1.5 text-xs font-bold text-mute"
                    >
                      Deny
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* badges */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Badges</h2>
        {dismissed.length === 0 ? (
          <p className="text-sm leading-relaxed text-mute">
            Nothing shelved. Badges you dismiss on your profile rest here — restore them anytime.
          </p>
        ) : (
          <div className="space-y-2">
            {dismissed.map((id) => {
              const b = badges?.find((x) => x.id === id)
              return (
                <div key={id} className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-3 text-lg font-black text-mute">
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{b?.title ?? id}</div>
                    {b && <div className="truncate text-xs text-mute">{b.detail}</div>}
                  </div>
                  <button
                    onClick={() => restoreBadge(id)}
                    className="press shrink-0 rounded-full border border-lime px-4 py-1.5 text-xs font-black text-lime transition hover:bg-lime hover:text-ink"
                  >
                    Restore
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* account */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Account</h2>
        <button
          onClick={logout}
          disabled={leaving}
          className="w-full rounded-2xl border border-miss/50 bg-miss/10 py-3.5 text-base font-black text-miss transition hover:bg-miss/20 disabled:opacity-50"
        >
          {leaving ? 'Logging out…' : 'Log out'}
        </button>
        <p className="mt-3 text-center text-xs text-mute">Logged in as @{profile?.username ?? '…'}</p>
      </section>
    </div>
  )
}
