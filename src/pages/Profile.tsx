import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, DropStats, Profile, Verdict } from '../lib/types'
import { winRateFor, WIN_RATE_MINIMUM } from '../lib/stats'
import { Avatar, navigate } from '../App'
import DropCard from '../components/DropCard'
import EmptyState from '../components/EmptyState'
import FollowButton from '../components/FollowButton'
import BadgeList from '../components/BadgeList'
import { useFeedVotes } from '../lib/feedVotes'
import TallyMarks from '../components/TallyMarks'
import CountUp from '../components/CountUp'
import Saved from './Saved'

interface ProfileStats {
  drops: number
  savedByOthers: number
  verdictsReceived: number
  rate: ReturnType<typeof winRateFor>
}

function DropsList({
  drops,
  dropStats,
  mySaves,
  myVotes,
  toggleSave,
  vote,
  setDropStats,
  profile,
  isOwn,
}: {
  drops: Drop[]
  dropStats: Map<string, DropStats>
  mySaves: Set<string>
  myVotes: Map<string, 'W' | 'L'>
  toggleSave: (id: string) => void
  vote: (dropId: string, v: 'W' | 'L', setStats: React.Dispatch<React.SetStateAction<Map<string, DropStats>>>, authorId?: string) => void
  setDropStats: React.Dispatch<React.SetStateAction<Map<string, DropStats>>>
  profile: Profile
  isOwn: boolean
}) {
  if (drops.length === 0) {
    return (
      <EmptyState
        title="No drops yet"
        body={isOwn ? 'Your first put-on is waiting. Drop something worth knowing.' : `Hear @${profile.username} out soon — nothing dropped yet.`}
        action={isOwn ? (
          <button onClick={() => navigate('/create')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
            Put someone on
          </button>
        ) : undefined}
      />
    )
  }
  return (
    <>
      {drops.map((d, i) => (
        <DropCard
          key={d.id}
          drop={{ ...d, author: profile }}
          stats={dropStats.get(d.id) ?? { saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 }}
          saved={mySaves.has(d.id)}
          onToggleSave={() => toggleSave(d.id)}
          myVote={myVotes.get(d.id) ?? null}
          onVote={(v) => vote(d.id, v, setDropStats, d.author_id)}
          revealDelay={(i % 6) * 70}
        />
      ))}
    </>
  )
}

export default function Profile({ id }: { id?: string }) {
  const { user, refreshProfile } = useAuth()
  const { myVotes, setVotesFromRows, vote } = useFeedVotes()
  const profileId = id ?? user?.id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [drops, setDrops] = useState<Drop[]>([])
  const [dropStats, setDropStats] = useState<Map<string, DropStats>>(new Map())
  const [mySaves, setMySaves] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', bio: '', city: '', avatar_url: '' })
  const [saving, setSaving] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const avatarFileRef = useRef<HTMLInputElement | null>(null)
  const [tab, setTab] = useState<'drops' | 'tallies'>('drops')
  const [isFollowing, setIsFollowing] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])

  const isOwn = user?.id === profileId

  // Keep the dismissed-badge list in sync with the loaded profile.
  useEffect(() => {
    setDismissed(profile?.dismissed_badges ?? [])
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismissBadge = async (id: string) => {
    if (!profile || dismissed.includes(id)) return
    const next = [...dismissed, id]
    setDismissed(next)
    await supabase.from('profiles').update({ dismissed_badges: next }).eq('id', profile.id)
  }

  const refreshFollow = async () => {
    if (!user || user.id === profileId) return
    const { data: f } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('followee_id', profileId)
      .maybeSingle()
    setIsFollowing(!!f)
  }

  useEffect(() => {
    if (!profileId) return
    let live = true
    const load = async () => {
      setLoading(true)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle()
      if (!live) return
      if (!p) {
        setProfile(null)
        setLoading(false)
        return
      }
      setProfile(p as Profile)
      setForm({
        display_name: (p as Profile).display_name ?? '',
        bio: (p as Profile).bio ?? '',
        city: (p as Profile).city ?? '',
        avatar_url: (p as Profile).avatar_url ?? '',
      })

      const [{ data: ds }, { count: f1 }, { count: f2 }] = await Promise.all([
        supabase.from('drops').select('*, author:profiles(*)').eq('author_id', profileId).order('created_at', { ascending: false }).limit(200),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('followee_id', profileId),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profileId),
      ])
      if (!live) return
      const list = (ds ?? []) as Drop[]
      setDrops(list)
      setFollowers(f1 ?? 0)
      setFollowing(f2 ?? 0)

      if (user && user.id !== profileId) {
        const { data: f } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('followee_id', profileId)
          .maybeSingle()
        if (live) setIsFollowing(!!f)
      } else if (live) {
        setIsFollowing(false)
      }

      const ids = list.map((d) => d.id)
      let savedByOthers = 0
      let verdictsReceived: Verdict[] = []
      const m = new Map<string, DropStats>()
      if (ids.length > 0) {
        const [{ data: saves }, { data: vts }, { data: cmts }] = await Promise.all([
          supabase.from('saves').select('drop_id').in('drop_id', ids).limit(5000),
          supabase.from('verdicts').select('*').in('drop_id', ids).limit(5000),
          supabase.from('comments').select('drop_id').in('drop_id', ids).limit(5000),
        ])
        savedByOthers = (saves ?? []).length
        verdictsReceived = (vts ?? []) as Verdict[]
        for (const did of ids) m.set(did, { saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 })
        for (const s of (saves ?? []) as Array<{ drop_id: string }>) m.get(s.drop_id)!.saves++
        for (const v of verdictsReceived) {
          const e = m.get(v.drop_id)!
          if (v.verdict === 'W') e.wins++
          else if (v.verdict === 'L') e.losses++
        }
        for (const c of (cmts ?? []) as Array<{ drop_id: string }>) m.get(c.drop_id)!.comments++
      }
      if (!live) return
      setDropStats(m)
      setVotesFromRows(verdictsReceived)
      setStats({
        drops: list.length,
        savedByOthers,
        verdictsReceived: verdictsReceived.filter((v) => v.verdict === 'W' || v.verdict === 'L').length,
        rate: winRateFor(verdictsReceived),
      })

      if (user) {
        const { data: mine } = await supabase.from('saves').select('drop_id').eq('user_id', user.id).limit(2000)
        if (live) setMySaves(new Set(((mine ?? []) as Array<{ drop_id: string }>).map((s) => s.drop_id)))
      }
      setLoading(false)
    }
    load()
    return () => {
      live = false
    }
  }, [profileId, user])

  const toggleSave = async (dropId: string) => {
    if (!user) {
      navigate('/auth')
      return
    }
    const saved = mySaves.has(dropId)
    if (saved) {
      await supabase.from('saves').delete().eq('user_id', user.id).eq('drop_id', dropId)
      setMySaves((p) => { const n = new Set(p); n.delete(dropId); return n })
    } else {
      await supabase.from('saves').insert({ user_id: user.id, drop_id: dropId })
      setMySaves((p) => new Set(p).add(dropId))
    }
  }

  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !user) return
    setAvatarError(null)
    setSaving(true)
    try {
      const path = `${user.id}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, f, {
        upsert: true,
        contentType: f.type || 'image/jpeg',
      })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setForm((fr) => ({ ...fr, avatar_url: `${data.publicUrl}?t=${Date.now()}` }))
    } catch {
      setAvatarError("Couldn't upload — try again in a bit.")
    } finally {
      setSaving(false)
    }
  }

  const saveProfile = async () => {    if (!user || !isOwn) return
    setSaving(true)
    try {
      await supabase
        .from('profiles')
        .update({
          display_name: form.display_name.trim() || null,
          bio: form.bio.trim() || null,
          city: form.city.trim() || 'Miami',
          avatar_url: form.avatar_url.trim() || null,
        })
        .eq('id', user.id)
      await refreshProfile()
      setProfile((p) => (p ? { ...p, ...form, city: form.city.trim() || 'Miami' } : p))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse px-4 py-6">
        <div className="mb-3 h-20 w-20 rounded-full bg-ink-3" />
        <div className="h-6 w-1/2 rounded bg-ink-3" />
      </div>
    )
  }

  if (!profile) {
    return <EmptyState title="Profile not found" body="This user doesn't exist." action={
      <button onClick={() => navigate('/')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
        Back to Discover
      </button>
    } />
  }

  const r = stats?.rate

  return (
    <div className="pb-8">
      <div className="border-b border-line px-4 pb-5 pt-6">
        <div className="flex items-start gap-4">
          <Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} size={84} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-3xl font-bold tracking-tight">
              {profile.display_name || `@${profile.username}`}
            </h1>
            <p className="text-sm text-mute">@{profile.username}{profile.city ? ` · ${profile.city}` : ''}</p>
          </div>
          {isOwn ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => navigate('/settings')}
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-lg text-fog transition hover:border-lime hover:text-lime"
              >
                ⚙️
              </button>
              <button
                onClick={() => setEditing((e) => !e)}
                className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-bold text-fog"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>
          ) : (
            <FollowButton followeeId={profile.id} onChange={refreshFollow} />
          )}
        </div>
        {profile.bio && !editing && <p className="mt-3 text-[15px] leading-relaxed">{profile.bio}</p>}

        {editing && isOwn && (
          <div className="rise-in mt-4 space-y-3 rounded-2xl border border-line bg-ink-2 p-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => avatarFileRef.current?.click()}
                className="relative shrink-0"
                aria-label="Upload profile photo"
              >
                <Avatar url={form.avatar_url || null} name={form.display_name || profile.username} size={64} />
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-lime text-sm text-ink shadow">
                  📷
                </span>
              </button>
              <div className="min-w-0">
                <div className="text-sm font-bold">Profile photo</div>
                <div className="text-xs text-mute">Tap the photo to upload a new one.</div>
                {avatarError && <div className="mt-1 text-xs font-bold text-miss">{avatarError}</div>}
              </div>
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarPick}
              />
            </div>
            {(['display_name', 'city'] as const).map((k) => (
              <div key={k}>
                <label className="mb-1 block text-xs font-bold capitalize text-mute">{k.replace('_', ' ')}</label>
                <input
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="w-full rounded-xl border border-line bg-ink-3 px-3 py-2 text-sm outline-none focus:border-lime"
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-bold text-mute">Bio</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={2}
                maxLength={160}
                className="w-full resize-none rounded-xl border border-line bg-ink-3 px-3 py-2 text-sm outline-none focus:border-lime"
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full rounded-full bg-lime py-2.5 text-sm font-black text-ink disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        )}

        {/* stat row */}
        <div className="mt-5 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-2xl border border-line bg-ink-2 px-2 py-3">
            <div className="text-xl font-black tabular-nums">{stats?.drops ?? 0}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-mute">Drops</div>
          </div>
          <button
            onClick={() => navigate(`/followers/${profile.id}`)}
            className="press rounded-2xl border border-line bg-ink-2 px-2 py-3"
          >
            <div className="text-xl font-black tabular-nums">{followers}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-mute">Followers</div>
          </button>
          <button
            onClick={() => navigate(`/following/${profile.id}`)}
            className="press rounded-2xl border border-line bg-ink-2 px-2 py-3"
          >
            <div className="text-xl font-black tabular-nums">{following}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-mute">Following</div>
          </button>
          <div className="rounded-2xl border border-lime/40 bg-lime/5 px-2 py-3" title="Win rate regressed toward 50 until volume earns it. Starts at 50 — real verdicts move it.">
            <div className="text-xl font-black tabular-nums text-lime">
              {r && r.rate != null ? <CountUp value={r.score} /> : '—'}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-mute">Taste Score</div>
          </div>
        </div>
        {r && r.rate != null && (r.wins > 0 || r.losses > 0) && (
          <div className="mt-4 rounded-2xl border border-line bg-ink-2 p-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-mute">The record</div>
            <TallyMarks wins={r.wins} losses={r.losses} />
          </div>
        )}
        {r && r.rate == null && (
          <p className="mt-2 text-center text-xs text-mute">
            Not enough data yet — win rate appears after {WIN_RATE_MINIMUM} verdicts. Missing verdicts never count as
            wins.
          </p>
        )}
        {r && r.rate != null && (
          <p className="mt-2 text-center text-xs text-mute">
            {r.wins} W · {r.losses} L across {r.total} verdicts · tallied by {stats?.savedByOthers ?? 0}
            <br />
            Taste Score starts at 50 — real verdicts move it. Saves don't count as visits.
          </p>
        )}

        <div className="mt-5">
          <BadgeList profileId={profile.id} isOwn={isOwn} dismissed={dismissed} onDismiss={dismissBadge} />
        </div>
      </div>

      {profile.is_private && !isOwn && !isFollowing ? (
        <div className="px-4 py-14 text-center">
          <div className="mb-3 text-5xl">🔒</div>
          <h2 className="text-xl font-black">This account is private</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-mute">
            Request to follow @{profile.username} to see their drops.
          </p>
        </div>
      ) : (
        <>
          {isOwn ? (
            <div className="flex gap-2 px-4 pt-4">
              {(['drops', 'tallies'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-5 py-1.5 text-sm font-black capitalize transition ${
                    tab === t ? 'bg-lime text-ink' : 'border border-line text-mute'
                  }`}
                >
                  {t === 'drops' ? `Drops · ${drops.length}` : 'Tallies'}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 pt-2">
              <h2 className="py-3 text-lg font-black">
                {`@${profile.username}'s drops`} · {drops.length}
              </h2>
            </div>
          )}
          {tab === 'tallies' && isOwn ? (
            <Saved bare />
          ) : (
            <DropsList
              drops={drops}
              dropStats={dropStats}
              mySaves={mySaves}
              myVotes={myVotes}
              toggleSave={toggleSave}
              vote={vote}
              setDropStats={setDropStats}
              profile={profile}
              isOwn={isOwn}
            />
          )}
        </>
      )}
    </div>
  )
}
