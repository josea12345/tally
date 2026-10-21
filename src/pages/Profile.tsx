import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, Profile, Verdict } from '../lib/types'
import { dropMedia } from '../lib/types'
import { winRateFor, WIN_RATE_MINIMUM, trustScoreFor, TRUST_MIN_DROPS, type TrustBreakdown } from '../lib/stats'
import { renderRecapCard } from '../lib/recapcard'
import { fetchStreak } from '../lib/streak'
import ProfileLists from '../components/ProfileLists'
import { shareTasteCard } from '../lib/tastecard'
import { Avatar, navigate } from '../App'
import DropGrid from '../components/DropGrid'
import { hiResArtwork } from '../components/ArtworkImage'
import EmptyState from '../components/EmptyState'
import FollowButton from '../components/FollowButton'
import ProfileMenu from '../components/ProfileMenu'
import BadgeList from '../components/BadgeList'
import Mascot from '../components/Mascot'
import { GearIcon, CameraIcon } from '../components/icons'
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
  profile,
  isOwn,
}: {
  drops: Drop[]
  profile: Profile
  isOwn: boolean
}) {
  const [dropSort, setDropSort] = useState<'new' | 'score' | 'verdicts'>('new')
  const [verdictCounts, setVerdictCounts] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (dropSort !== 'verdicts' || drops.length === 0) return
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('verdicts')
        .select('drop_id')
        .in('drop_id', drops.map((d) => d.id))
        .not('verdict', 'is', null)
        .limit(5000)
      if (!live) return
      const counts = new Map<string, number>()
      for (const r of (data ?? []) as Array<{ drop_id: string }>) {
        counts.set(r.drop_id, (counts.get(r.drop_id) ?? 0) + 1)
      }
      setVerdictCounts(counts)
    })()
    return () => {
      live = false
    }
  }, [dropSort, drops])
  const sortedDrops =
    dropSort === 'score'
      ? [...drops].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      : dropSort === 'verdicts'
        ? [...drops].sort((a, b) => (verdictCounts.get(b.id) ?? 0) - (verdictCounts.get(a.id) ?? 0))
        : drops

  if (drops.length === 0) {
    return (
      <EmptyState
        title="No drops yet"
        body={isOwn ? 'Your first put-on is waiting. Drop something worth knowing.' : `Hear @${profile.username} out soon — nothing dropped yet.`}
        action={isOwn ? (
          <button onClick={() => navigate('/create')} className="rounded-full bg-sig px-6 py-2.5 text-sm font-black text-ink">
            Put someone on
          </button>
        ) : undefined}
      />
    )
  }
  const pinned = profile.pinned_drop_id
    ? drops.find((d) => d.id === profile.pinned_drop_id)
    : undefined
  const pinnedMedia = pinned ? dropMedia(pinned)[0] : undefined
  return (
    <div>
      {pinned && (
        <button
          onClick={() => navigate(`/drop/${pinned.id}`)}
          className="block w-full px-4 pb-1 pt-3 text-left"
        >
          <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-sig">
            Signature put-on
          </span>
          <span className="relative block overflow-hidden rounded-3xl border border-line bg-ink-3">
            {pinnedMedia && (
              <img
                src={
                  pinnedMedia.type === 'video'
                    ? (pinnedMedia.posterUrl ?? '')
                    : hiResArtwork(pinnedMedia.url)
                }
                alt=""
                loading="lazy"
                className="h-44 w-full object-cover"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/80 via-black/35 to-transparent p-4 pt-12">
              <span className="block truncate text-lg font-black text-white">{pinned.title}</span>
              <span className="block text-xs font-bold text-white/80">
                {pinned.score != null ? `Their call: ${pinned.score}/10` : 'No score given'}
                {pinned.city ? ` · ${pinned.city}` : ''}
              </span>
            </span>
          </span>
        </button>
      )}
      {drops.length > 3 && (
        <div className="mb-3 flex gap-1.5 px-4">
          {(
            [
              { id: 'new', label: 'Newest' },
              { id: 'score', label: 'Top scored' },
              { id: 'verdicts', label: 'Most verdicts' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setDropSort(s.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-black transition ${
                dropSort === s.id ? 'bg-sig text-ink' : 'border border-line text-mute hover:text-fog'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <DropGrid drops={sortedDrops} />
    </div>
  )
}

export default function Profile({ id }: { id?: string }) {
  const { user, refreshProfile } = useAuth()
  const profileId = id ?? user?.id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [drops, setDrops] = useState<Drop[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', bio: '', city: '', avatar_url: '' })
  const [saving, setSaving] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const avatarFileRef = useRef<HTMLInputElement | null>(null)
  const [tab, setTab] = useState<'drops' | 'tallies'>('drops')
  const [showFormula, setShowFormula] = useState(false)
  const [trust, setTrust] = useState<TrustBreakdown | null>(null)
  const [streak, setStreak] = useState(0)
  const [week, setWeek] = useState<{ w: number; l: number; tallies: number; comments: number; followers: number } | null>(null)
  const [recapBusy, setRecapBusy] = useState(false)
  const [profileCopied, setProfileCopied] = useState(false)
  const [showTrustInfo, setShowTrustInfo] = useState(false)
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
        supabase.from('drops').select('*, author:profiles!drops_author_id_fkey(*)').eq('author_id', profileId).order('created_at', { ascending: false }).limit(200),
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
      let savesCache: Array<{ drop_id: string; created_at: string }> = []
      let verdictsReceived: Verdict[] = []
      let commentCount = 0
      let communityByDrop = new Map<string, number[]>()
      if (ids.length > 0) {
        const [{ data: saves }, { data: vts }, { count: cc }, { data: rated }] = await Promise.all([
          supabase.from('saves').select('drop_id,created_at').in('drop_id', ids).limit(5000),
          supabase.from('verdicts').select('*').in('drop_id', ids).limit(5000),
          supabase.from('comments').select('id', { count: 'exact', head: true }).in('drop_id', ids),
          supabase.from('comments').select('drop_id,user_id,rating').in('drop_id', ids).not('rating', 'is', null).limit(2000),
        ])
        savedByOthers = (saves ?? []).length
        savesCache = (saves ?? []) as Array<{ drop_id: string; created_at: string }>
        verdictsReceived = (vts ?? []) as Verdict[]
        commentCount = cc ?? 0
        for (const rc of (rated ?? []) as Array<{ drop_id: string; user_id: string; rating: number }>) {
          // The author's own comment ratings don't count — their take is the drop's score.
          if (rc.user_id === profileId) continue
          const arr = communityByDrop.get(rc.drop_id) ?? []
          arr.push(rc.rating)
          communityByDrop.set(rc.drop_id, arr)
        }
      }
      if (!live) return
      setStats({
        drops: list.length,
        savedByOthers,
        verdictsReceived: verdictsReceived.filter((v) => v.verdict === 'W' || v.verdict === 'L').length,
        rate: winRateFor(verdictsReceived),
      })
      if (live) {
        setTrust(
          trustScoreFor(
            list.map((d) => ({ score: d.score, community: communityByDrop.get(d.id) ?? [] })),
            verdictsReceived.length + commentCount + savedByOthers
          )
        )
      }
      fetchStreak(profileId)
        .then((s) => {
          if (live) setStreak(s)
        })
        .catch(() => {})

      // "This week" recap — own profile only: new verdicts, tallies,
      // comments, and followers in the last 7 days.
      if (live && user && user.id === profileId) {
        const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
        const wv = verdictsReceived.filter((v) => v.created_at >= weekAgo)
        const [{ count: cw }, { count: fw }] = await Promise.all([
          ids.length > 0
            ? supabase
                .from('comments')
                .select('id', { count: 'exact', head: true })
                .in('drop_id', ids)
                .gte('created_at', weekAgo)
            : Promise.resolve({ count: 0 }),
          supabase
            .from('follows')
            .select('id', { count: 'exact', head: true })
            .eq('followee_id', profileId)
            .gte('created_at', weekAgo),
        ])
        if (live) {
          setWeek({
            w: wv.filter((v) => v.verdict === 'W').length,
            l: wv.filter((v) => v.verdict === 'L').length,
            tallies: savesCache.filter((s) => s.created_at >= weekAgo).length,
            comments: cw ?? 0,
            followers: fw ?? 0,
          })
        }
      }

      setLoading(false)
    }
    load()
    return () => {
      live = false
    }
  }, [profileId, user])

  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !user) return
    setAvatarError(null)
    if (!f.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setAvatarError('That image is over 5 MB — pick something smaller.')
      return
    }
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
      <button onClick={() => navigate('/')} className="rounded-full bg-sig px-6 py-2.5 text-sm font-black text-ink">
        Back to Discover
      </button>
    } />
  }

  const r = stats?.rate

  // Overall: the average of whichever scores exist (Taste + Trust), shown as a
  // compact badge by the name. Null until at least one score has data.
  const tasteScore = r && r.rate != null ? Math.round(r.score) : null
  const trustScore = trust && trust.score != null ? Math.round(trust.score) : null
  const overallScore =
    tasteScore != null && trustScore != null
      ? Math.round((tasteScore + trustScore) / 2)
      : (tasteScore ?? trustScore)

  const shareWeek = async () => {
    if (!week || recapBusy) return
    setRecapBusy(true)
    try {
      const blob = await renderRecapCard(profile, week, tasteScore, trustScore, streak)
      await shareTasteCard(blob, `tally-week-${profile.username}`)
    } catch {
      // card sharing is garnish — never surface an error for it
    } finally {
      setRecapBusy(false)
    }
  }

  const shareProfile = async () => {
    const url = `${window.location.origin}/u/${profile.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: `@${profile.username} on TALLY`, url })
        return
      }
      throw new Error('no native share')
    } catch {
      try {
        await navigator.clipboard.writeText(url)
        setProfileCopied(true)
        setTimeout(() => setProfileCopied(false), 1600)
      } catch {
        // clipboard unavailable
      }
    }
  }

  return (
    <div className="pb-8">
      <div className="border-b border-line px-4 pb-5 pt-6">
        <div className="flex items-start gap-4">
          <Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} size={84} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="wordmark truncate text-3xl">
                {profile.display_name || `@${profile.username}`}
              </h1>
              <span
                className={`flex shrink-0 items-baseline gap-1 rounded-full border px-2.5 py-1 ${
                  overallScore != null ? 'border-sig/50 bg-sig/10' : 'border-line bg-ink-2'
                }`}
                title="Overall score — the average of Taste Score and Trust"
              >
                <span
                  className={`text-base font-black tabular-nums ${
                    overallScore != null ? 'text-sig' : 'text-mute'
                  }`}
                >
                  {overallScore ?? '–'}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-mute">OVR</span>
              </span>
            </div>
            <p className="text-sm text-mute">@{profile.username}{profile.city ? ` · ${profile.city}` : ''}</p>
            {streak >= 2 && (
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-butter/50 bg-butter/10 px-2.5 py-1 text-[11px] font-black text-butter">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
                  <path d="M4 5v14M9.3 5v14M14.6 5v14M19.9 5v14M3 17.5 21 6.5" />
                </svg>
                {streak}-week streak
              </span>
            )}
          </div>
          {isOwn ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => navigate('/settings')}
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-line text-fog transition hover:border-sig hover:text-sig"
              >
                <GearIcon className="h-5 w-5" />
              </button>
              <button
                onClick={shareProfile}
                className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-bold text-fog"
              >
                {profileCopied ? 'Copied!' : 'Share'}
              </button>
              <button
                onClick={() => setEditing((e) => !e)}
                className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-bold text-fog"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <FollowButton followeeId={profile.id} onChange={refreshFollow} />
              <button
                onClick={shareProfile}
                className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-bold text-fog"
              >
                {profileCopied ? 'Copied!' : 'Share'}
              </button>
              <ProfileMenu targetId={profile.id} handle={profile.username} />
            </div>
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
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#191725] bg-sig text-[var(--color-sig-ink)] shadow">
                  <CameraIcon className="h-4 w-4" />
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
                  className="w-full rounded-xl border border-line bg-ink-3 px-3 py-2 text-sm outline-none focus:border-sig"
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
                className="w-full resize-none rounded-xl border border-line bg-ink-3 px-3 py-2 text-sm outline-none focus:border-sig"
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full rounded-full bg-sig py-2.5 text-sm font-black text-ink disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        )}

        {/* scores: taste + trust, compact side by side */}
        <div className="mt-6">
          <div className="flex items-start justify-center gap-10">
            {/* taste */}
            <div className="flex w-36 flex-col items-center">
              <div className="relative h-28 w-28">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                  {r && r.rate != null && (
                    <circle
                      cx="50"
                      cy="50"
                      r="44"
                      fill="none"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 44}
                      strokeDashoffset={2 * Math.PI * 44 * (1 - r.score / 100)}
                      style={{ stroke: 'var(--color-sig)', filter: 'drop-shadow(0 0 8px rgba(69, 200, 255, 0.55))' }}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-black tabular-nums text-sig">
                    {r && r.rate != null ? <CountUp value={r.score} /> : '—'}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-mute">
                Taste Score
              </div>
              {r && r.rate == null && (
                <p className="mt-1 text-center text-[11px] leading-snug text-mute">
                  Appears after {WIN_RATE_MINIMUM} verdicts
                </p>
              )}
              <button
                onClick={() => setShowFormula((s) => !s)}
                className="mt-1 text-[11px] font-bold text-mute transition hover:text-sig"
              >
                How it's calculated {showFormula ? '▴' : '▾'}
              </button>
            </div>

            {/* trust */}
            <div className="flex w-36 flex-col items-center">
              <div className="relative h-28 w-28">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                  {trust && trust.score != null && (
                    <circle
                      cx="50"
                      cy="50"
                      r="44"
                      fill="none"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 44}
                      strokeDashoffset={2 * Math.PI * 44 * (1 - trust.score / 100)}
                      style={{ stroke: 'var(--color-win)', filter: 'drop-shadow(0 0 8px rgba(105, 231, 207, 0.45))' }}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-black tabular-nums text-win">
                    {trust && trust.score != null ? <CountUp value={trust.score} /> : '—'}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-mute">
                Trust
              </div>
              {trust && trust.score == null && (
                <p className="mt-1 text-center text-[11px] leading-snug text-mute">
                  Appears with {TRUST_MIN_DROPS} rated drops
                </p>
              )}
              {trust && trust.score != null && trust.meanDiff != null && (
                <p className="mt-1 text-center text-[11px] leading-snug text-mute">
                  Within <span className="font-bold text-fog">{trust.meanDiff.toFixed(1)}</span> of the community
                </p>
              )}
              <button
                onClick={() => setShowTrustInfo((s) => !s)}
                className="mt-1 text-[11px] font-bold text-mute transition hover:text-sig"
              >
                How it's calculated {showTrustInfo ? '▴' : '▾'}
              </button>
            </div>
          </div>

          {showFormula && (
            <div className="mx-auto mt-3 w-full max-w-[320px] rounded-2xl border border-line bg-ink-2 p-4">
              <div className="mb-2 text-center text-sm font-black tracking-tight">
                Score = the low end of your win rate's 95% confidence range × 100
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-mute">
                <li>· Your score is the worst your win rate plausibly is — not the raw percentage.</li>
                <li>· 5 lucky Ws score 57. 850 Ws out of 1,000 score 83. Volume earns trust.</li>
                <li>· Only W/L verdicts move it. Saves, views, and missing verdicts never count.</li>
                <li>· Your score appears after {WIN_RATE_MINIMUM} verdicts.</li>
              </ul>
            </div>
          )}
          {showTrustInfo && (
            <div className="mx-auto mt-3 w-full max-w-[320px] rounded-2xl border border-line bg-ink-2 p-4">
              <div className="mb-2 text-center text-sm font-black tracking-tight">
                Do your ratings hold up?
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-mute">
                <li>· 70% rating accuracy — how close your 1–10 score lands to the community's mean rating on your drops.</li>
                <li>· 30% engagement — verdicts, comments, and tallies on your drops (log-scaled, maxes out around 100).</li>
                <li>· Only drops with your score + at least 2 community ratings count. Your own comment ratings never count.</li>
                <li>· Rate other people's drops in the comments to feed their Trust.</li>
              </ul>
            </div>
          )}

          {r && r.rate != null && (r.wins > 0 || r.losses > 0) && (
            <div className="mx-auto mt-4 w-full max-w-[300px]">
              <TallyMarks wins={r.wins} losses={r.losses} />
              <p className="mt-2 text-center text-xs text-mute">
                {r.wins} W · {r.losses} L across {r.total} verdicts · tallied by {stats?.savedByOthers ?? 0}
              </p>
            </div>
          )}
          {r && r.rate != null && (
            <p className="mt-1 text-center text-[11px] text-mute/70">
              Only verdicts move it — and more verdicts move it more. Saves don't count.
            </p>
          )}
        </div>

        {/* this week recap — own profile only */}
        {week && (
          <div className="mx-auto mt-4 w-full max-w-[430px] rounded-2xl border border-line bg-ink-2 px-3 py-2.5">
            <div className="mb-1.5 text-center text-[9px] font-black uppercase tracking-[0.22em] text-mute">
              This week
            </div>
            {week.w + week.l + week.tallies + week.comments + week.followers === 0 ? (
              <p className="text-center text-[11px] text-mute">
                Quiet so far — no new action on your drops yet.
              </p>
            ) : (
              <div className="flex items-start justify-between gap-2 text-center">
                <div className="min-w-0 flex-1">
                  <div className="whitespace-nowrap text-sm font-black tabular-nums">
                    <span className="text-win">{week.w} W</span>
                    <span className="text-mute"> · </span>
                    <span className="text-miss">{week.l} L</span>
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-mute">verdicts</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black tabular-nums text-fog">{week.tallies}</div>
                  <div className="mt-0.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-mute">tallies</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black tabular-nums text-fog">{week.comments}</div>
                  <div className="mt-0.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-mute">comments</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black tabular-nums text-fog">{week.followers}</div>
                  <div className="mt-0.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-mute">follows</div>
                </div>
              </div>
            )}
            {week.w + week.l + week.tallies + week.comments + week.followers > 0 && (
              <button
                onClick={shareWeek}
                disabled={recapBusy}
                className="mt-2.5 w-full rounded-full border border-sig/50 py-1.5 text-[11px] font-black text-sig transition hover:bg-sig hover:text-ink disabled:opacity-50"
              >
                {recapBusy ? 'Rendering…' : 'Share week card'}
              </button>
            )}
          </div>
        )}

        <ProfileLists ownerId={profile.id} />

        {/* demoted stats */}
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-mute">
          <span>
            <span className="font-bold text-fog">{stats?.drops ?? 0}</span> drops
          </span>
          <span className="text-mute/50">·</span>
          <button onClick={() => navigate(`/followers/${profile.id}`)} className="transition hover:text-sig">
            <span className="font-bold text-fog">{followers}</span> followers
          </button>
          <span className="text-mute/50">·</span>
          <button onClick={() => navigate(`/following/${profile.id}`)} className="transition hover:text-sig">
            <span className="font-bold text-fog">{following}</span> following
          </button>
        </div>

        <div className="mt-5">
          <BadgeList profileId={profile.id} isOwn={isOwn} dismissed={dismissed} onDismiss={dismissBadge} />
        </div>
      </div>

      {profile.is_private && !isOwn && !isFollowing ? (
        <div className="px-4 py-14 text-center">
          <Mascot mood="sleepy" className="pop-in mx-auto mb-4 h-24 w-24" />
          <h2 className="wordmark text-2xl">This account is private</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-mute">
            It's a little too quiet in here — request to follow @{profile.username} to see their drops.
          </p>
        </div>
      ) : (
        <>
          {isOwn ? (
            <div className="flex items-center justify-center gap-6 px-4 pb-1 pt-3">
              {(['drops', 'tallies'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative px-1 py-1 text-[16px] capitalize transition ${
                    tab === t ? 'font-black text-fog' : 'font-bold text-mute hover:text-fog'
                  }`}
                >
                  {t === 'drops' ? 'Drops' : 'Tallies'}
                  {tab === t && (
                    <span className="absolute -bottom-[1px] left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-sig" />
                  )}
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
            <DropsList drops={drops} profile={profile} isOwn={isOwn} />
          )}
        </>
      )}
    </div>
  )
}
