import { useEffect, useState } from 'react'
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

interface ProfileStats {
  drops: number
  savedByOthers: number
  verdictsReceived: number
  rate: ReturnType<typeof winRateFor>
}

export default function Profile({ id }: { id?: string }) {
  const { user, refreshProfile } = useAuth()
  const { myVotes, triedIds, setVotesFromRows, vote, markTried } = useFeedVotes()
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

  const isOwn = user?.id === profileId

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

  const saveProfile = async () => {
    if (!user || !isOwn) return
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
            <p className="mt-1 text-sm text-mute">
              <b className="text-fog">{followers}</b> followers · <b className="text-fog">{following}</b> following
            </p>
          </div>
          {isOwn ? (
            <button
              onClick={() => setEditing((e) => !e)}
              className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-bold text-fog"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
          ) : (
            <FollowButton followeeId={profile.id} />
          )}
        </div>
        {profile.bio && !editing && <p className="mt-3 text-[15px] leading-relaxed">{profile.bio}</p>}

        {editing && isOwn && (
          <div className="rise-in mt-4 space-y-3 rounded-2xl border border-line bg-ink-2 p-4">
            {(['display_name', 'city', 'avatar_url'] as const).map((k) => (
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
          {[
            ['Drops', stats?.drops ?? 0],
            ['Saved', stats?.savedByOthers ?? 0],
            ['Verdicts', stats?.verdictsReceived ?? 0],
          ].map(([label, val]) => (
            <div key={label as string} className="rounded-2xl border border-line bg-ink-2 px-2 py-3">
              <div className="text-xl font-black tabular-nums">{val}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-mute">{label}</div>
            </div>
          ))}
          <div className="rounded-2xl border border-lime/40 bg-lime/5 px-2 py-3">
            <div className="text-xl font-black tabular-nums text-lime">
              {r && r.rate != null ? <CountUp value={Math.round(r.rate * 100)} suffix="%" /> : '—'}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-mute">Win rate</div>
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
            {r.wins} W · {r.losses} L across {r.total} verdicts — saves don't count as visits.
          </p>
        )}

        <div className="mt-5">
          <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-mute">Earned on the record</h2>
          <BadgeList profileId={profile.id} />
        </div>
      </div>

      <div className="px-4 pt-2">
        <h2 className="py-3 text-lg font-black">
          {isOwn ? 'Your drops' : `@${profile.username}'s drops`} · {drops.length}
        </h2>
      </div>
      {drops.length === 0 ? (
        <EmptyState
          title={isOwn ? 'No drops yet' : 'No drops yet'}
          body={isOwn ? 'Your first put-on is waiting. Drop something worth knowing.' : `Hear @${profile.username} out soon — nothing dropped yet.`}
          action={isOwn ? (
            <button onClick={() => navigate('/create')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
              Put someone on
            </button>
          ) : undefined}
        />
      ) : (
        drops.map((d, i) => (
          <DropCard
            key={d.id}
            drop={{ ...d, author: profile }}
            stats={dropStats.get(d.id) ?? { saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 }}
            saved={mySaves.has(d.id)}
            onToggleSave={() => toggleSave(d.id)}
            myVote={myVotes.get(d.id) ?? null}
            onVote={(v) => vote(d.id, v, setDropStats)}
            tried={triedIds.has(d.id)}
            onMarkTried={() => markTried(d.id, myVotes.get(d.id) ?? null)}
            revealDelay={(i % 6) * 70}
          />
        ))
      )}
    </div>
  )
}
