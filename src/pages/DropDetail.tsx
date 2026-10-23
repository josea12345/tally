import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, DropStats, Profile, Verdict } from '../lib/types'
import { timeAgo, topicKeyFor } from '../lib/format'
import { Avatar, navigate } from '../App'
import VerdictBox from '../components/VerdictBox'
import PutOnChain from '../components/PutOnChain'
import Comments from '../components/Comments'
import LinkChips from '../components/LinkChips'
import SoundChip from '../components/SoundChip'
import SoundPill from '../components/SoundPill'
import { getSoundSnapshot, isCurrentSound, pauseSound, playSound } from '../lib/sound'
import { cutEndAt } from '../lib/video'
import { overlayTextStyle, textVisibleAt } from '../lib/filters'
import MediaCarousel from '../components/MediaCarousel'
import ArtworkImage, { isArtworkUrl } from '../components/ArtworkImage'
import DropMenu from '../components/DropMenu'
import { dropMedia } from '../lib/types'
import { deleteDropFiles, fetchVerdictProofUrls } from '../lib/media'
import { shareDrop } from '../lib/share'
import { tapHaptic } from '../lib/haptics'
import EmptyState from '../components/EmptyState'
import FollowButton from '../components/FollowButton'
import TallyIcon from '../components/TallyIcon'
import { renderTasteCard, shareTasteCard } from '../lib/tastecard'
import { fetchAuthorWinRate, fetchTrustBreakdown } from '../lib/trustData'
import { WIN_RATE_MINIMUM } from '../lib/stats'
import MentionText from '../components/MentionText'
import RelatedDrops from '../components/RelatedDrops'
import AddToListSheet from '../components/AddToListSheet'
import { markSeen } from '../lib/seen'
import ReminderButton from '../components/ReminderButton'

export default function DropDetail({ id }: { id: string }) {
  const { user, profile, refreshProfile } = useAuth()
  const [drop, setDrop] = useState<Drop | null>(null)
  /** Per-video edited-timeline position — gates timed text overlays. */
  const [videoPos, setVideoPos] = useState<Record<string, number>>({})
  const [stats, setStats] = useState<DropStats>({ saves: 0, wins: 0, losses: 0, tried: 0, comments: 0 })
  const [myVerdict, setMyVerdict] = useState<Verdict | null>(null)
  const [saved, setSaved] = useState(false)
  const [verdicts, setVerdicts] = useState<Verdict[]>([])
  const [authorRate, setAuthorRate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cardBusy, setCardBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [relatedCount, setRelatedCount] = useState<number | null>(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState(false)
  // Receipts: verdicts carrying a proof photo, enriched with voter profiles.
  const [proofs, setProofs] = useState<Array<{ verdict: Verdict; profile: Profile | null }>>([])
  const [proofView, setProofView] = useState<string | null>(null)
  const [listing, setListing] = useState(false)
  // Verdict notes ("the calls") + author-only view count.
  const [callNotes, setCallNotes] = useState<Array<{ verdict: Verdict; profile: Profile | null }>>([])
  const [viewCount, setViewCount] = useState<number | null>(null)
  const [talliers, setTalliers] = useState<Profile[]>([])
  useEffect(() => {
    const withNote = verdicts.filter((v) => v.note)
    if (withNote.length === 0) {
      setCallNotes([])
      return
    }
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('id', [...new Set(withNote.map((v) => v.user_id))])
      if (!live) return
      const byId = new Map(((data ?? []) as Profile[]).map((p) => [p.id, p]))
      setCallNotes(withNote.map((v) => ({ verdict: v, profile: byId.get(v.user_id) ?? null })))
    })()
    return () => {
      live = false
    }
  }, [verdicts])
  useEffect(() => {
    const withProof = verdicts.filter((v) => v.proof_url)
    if (withProof.length === 0) {
      setProofs([])
      return
    }
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('id', [...new Set(withProof.map((v) => v.user_id))])
      if (!live) return
      const byId = new Map(((data ?? []) as Profile[]).map((p) => [p.id, p]))
      setProofs(withProof.map((v) => ({ verdict: v, profile: byId.get(v.user_id) ?? null })))
    })()
    return () => {
      live = false
    }
  }, [verdicts])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: dErr } = await supabase
        .from('drops')
        .select('*, author:profiles!drops_author_id_fkey(*)')
        .eq('id', id)
        .maybeSingle()
      if (dErr) throw dErr
      if (!data) {
        setError('This drop is gone — it may have been deleted.')
        return
      }
      const d = data as Drop
      setDrop(d)

      // How many put-ons share this topic, including this one (RLS hides
      // blocked/private). The button always shows — it teaches the feature
      // even before a second person posts about the same thing.
      const tkey = d.topic_key ?? topicKeyFor(d)
      supabase
        .from('drops')
        .select('id', { count: 'exact', head: true })
        .eq('topic_key', tkey)
        .then(({ count }) => setRelatedCount(count ?? 1))

      const [{ data: saves }, { data: vts }, { data: cmts }] = await Promise.all([
        supabase.from('saves').select('id').eq('drop_id', id).limit(5000),
        supabase.from('verdicts').select('*').eq('drop_id', id).limit(5000),
        supabase.from('comments').select('id').eq('drop_id', id).limit(5000),
      ])
      const vlist = (vts ?? []) as Verdict[]
      setVerdicts(vlist)
      setStats({
        saves: (saves ?? []).length,
        wins: vlist.filter((v) => v.verdict === 'W').length,
        losses: vlist.filter((v) => v.verdict === 'L').length,
        tried: vlist.filter((v) => v.tried).length,
        comments: (cmts ?? []).length,
      })

      if (user) {
        const [{ data: mine }, { data: mySave }] = await Promise.all([
          supabase.from('verdicts').select('*').eq('drop_id', id).eq('user_id', user.id).maybeSingle(),
          supabase.from('saves').select('id').eq('drop_id', id).eq('user_id', user.id).maybeSingle(),
        ])
        setMyVerdict((mine as Verdict | null) ?? null)
        setSaved(!!mySave)
      }

      // Author's win rate for the payoff banner — exact DB counts via the
      // drop join (verified pattern: select … drop:drops!inner + head count),
      // so it stays correct past any client-side row cap. Same rule as
      // before: rate is null below WIN_RATE_MINIMUM verdicts.
      const [{ count: aWins }, { count: aLosses }] = await Promise.all([
        supabase
          .from('verdicts')
          .select('id, drop:drops!inner(author_id)', { count: 'exact', head: true })
          .eq('verdict', 'W')
          .eq('drop.author_id', d.author_id),
        supabase
          .from('verdicts')
          .select('id, drop:drops!inner(author_id)', { count: 'exact', head: true })
          .eq('verdict', 'L')
          .eq('drop.author_id', d.author_id),
      ])
      const aTotal = (aWins ?? 0) + (aLosses ?? 0)
      setAuthorRate(
        aTotal >= WIN_RATE_MINIMUM
          ? `${Math.round(((aWins ?? 0) / aTotal) * 100)}% win rate · ${aTotal} verdicts`
          : null
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this drop.')
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    load()
  }, [load])

  const toggleSave = async () => {
    tapHaptic()
    if (!user) {
      navigate('/auth')
      return
    }
    if (!drop || saveBusy) return
    setSaveBusy(true)
    if (saved) {
      // Optimistic remove, rolled back if the delete fails.
      setSaved(false)
      setStats((s) => ({ ...s, saves: Math.max(0, s.saves - 1) }))
      const { error } = await supabase.from('saves').delete().eq('user_id', user.id).eq('drop_id', drop.id)
      if (error) {
        setSaved(true)
        setStats((s) => ({ ...s, saves: s.saves + 1 }))
        setSaveError('Could not remove the save — try again.')
      }
    } else {
      // Optimistic add, rolled back on failure (e.g. a duplicate tap that
      // lost the race — saves has a unique(user_id, drop_id) constraint).
      setSaved(true)
      setStats((s) => ({ ...s, saves: s.saves + 1 }))
      const { error } = await supabase.from('saves').insert({ user_id: user.id, drop_id: drop.id })
      if (error) {
        setSaved(false)
        setStats((s) => ({ ...s, saves: Math.max(0, s.saves - 1) }))
        setSaveError('Could not save — try again.')
      }
    }
    setSaveBusy(false)
  }

  const copyLink = async () => {
    if (!drop) return
    // Native share sheet on phones; clipboard copy on desktop.
    const r = await shareDrop(drop)
    if (r === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Record a view (author excluded, once per viewer per day per device)
  // and load the author's view count.
  useEffect(() => {
    if (!drop) return
    const isAuthor = !!user && user.id === drop.author_id
    if (isAuthor) {
      let live = true
      ;(async () => {
        const { count } = await supabase
          .from('drop_views')
          .select('id', { count: 'exact', head: true })
          .eq('drop_id', drop.id)
        if (live) setViewCount(count ?? 0)
        const { data: saveRows } = await supabase
          .from('saves')
          .select('user:profiles!saves_user_id_fkey(id, username, display_name, avatar_url)')
          .eq('drop_id', drop.id)
          .order('created_at', { ascending: false })
          .limit(30)
        if (live && saveRows) {
          const people = (
            saveRows as unknown as Array<{ user: Profile | null }>
          )
            .map((r) => r.user)
            .filter((p): p is Profile => !!p && p.id !== drop.author_id)
          setTalliers(people)
        }
      })()
      return () => {
        live = false
      }
    }
    const key = `tally-viewed-${drop.id}-${new Date().toISOString().slice(0, 10)}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // storage unavailable — count the view anyway
    }
    void supabase.from('drop_views').insert({ drop_id: drop.id, viewer_id: user?.id ?? null })
    markSeen(drop.id)
  }, [drop?.id, user?.id])

  const exportCard = async () => {
    if (!drop?.author) return
    setCardBusy(true)
    try {
      const [trust, authorRate] = await Promise.all([
        fetchTrustBreakdown(drop.author_id),
        fetchAuthorWinRate(drop.author_id),
      ])
      const blob = await renderTasteCard(
        drop,
        drop.author.display_name ?? drop.author.username,
        drop.author.username,
        verdicts,
        trust?.score ?? null,
        authorRate
      )
      const how = await shareTasteCard(blob, drop.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
      alert(how === 'shared' ? 'Taste card shared — story-sized and ready to post.' : 'Taste card saved — story-sized and ready to post.')
    } catch {
      alert('Could not render the taste card — try again.')
    } finally {
      setCardBusy(false)
    }
  }

  const remove = async () => {
    if (!drop || !user || drop.author_id !== user.id) return
    if (!window.confirm('Delete this drop? This cannot be undone.')) return
    setDeleting(true)
    try {
      // Verdict rows (and their proof photos) cascade away with the
      // drop — grab the proof URLs first so the files can go too.
      const proofUrls = await fetchVerdictProofUrls(drop.id)
      await supabase.from('drops').delete().eq('id', drop.id)
      await deleteDropFiles(drop, proofUrls)
      navigate('/')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse px-4 py-6">
        <div className="mb-3 h-8 w-2/3 rounded bg-ink-3" />
        <div className="mb-2 h-4 w-full rounded bg-ink-3" />
        <div className="h-4 w-1/2 rounded bg-ink-3" />
      </div>
    )
  }

  if (error || !drop) {
    return <EmptyState title="Drop not found" body={error ?? 'This drop does not exist.'} action={
      <button onClick={() => navigate('/')} className="btn-pop press px-6 py-2.5 text-sm">
        Back to Discover
      </button>
    } />
  }

  const author = drop.author
  const soundSeg = drop.sound_preview_url
    ? { start: drop.sound_start_sec ?? 0, end: drop.sound_end_sec }
    : null
  const isOwner = user?.id === drop.author_id
  const isPinned = !!profile && profile.pinned_drop_id === drop.id
  const togglePin = async () => {
    if (!user || pinBusy) return
    setPinBusy(true)
    setPinError(false)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pinned_drop_id: isPinned ? null : drop.id })
        .eq('id', user.id)
      if (error) throw error
      await refreshProfile()
    } catch {
      setPinError(true)
    } finally {
      setPinBusy(false)
    }
  }

  return (
    <div className="pb-8">
      {!user && (
        <div className="border-b border-line bg-sig px-4 py-3 text-center">
          <p className="text-sm font-black text-ink">
            Someone put you on — join Peak to save it and call W or L.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="mt-2 rounded-full bg-ink px-6 py-2 text-sm font-black text-sig"
          >
            Join Peak
          </button>
        </div>
      )}

      {dropMedia(drop).length > 0 && (
        <div className="relative border-b border-line px-4 py-3">
          {drop.sound_preview_url && (
            <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
              <SoundPill
                title={drop.sound_title ?? 'Soundtrack'}
                artist={drop.sound_artist}
                coverUrl={drop.sound_cover_url}
                previewUrl={drop.sound_preview_url}
                start={drop.sound_start_sec ?? 0}
                end={drop.sound_end_sec}
              />
            </div>
          )}
          <MediaCarousel
            items={dropMedia(drop)}
            renderItem={(it) =>
              it.type === 'video' ? (
                <span className="relative block h-full w-full" style={{ containerType: 'inline-size' }}>
                  <video
                    src={it.url}
                    poster={it.posterUrl ?? undefined}
                    controls
                    autoPlay
                    muted
                    loop={!(it.edit?.trimStart || it.edit?.trimEnd)}
                    playsInline
                    preload="metadata"
                    className="h-full max-h-[420px] w-full bg-black"
                    style={{ filter: it.edit?.filterCss || undefined }}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      v.volume = it.edit?.origVolume ?? 1
                      if (it.edit?.speed) v.playbackRate = it.edit.speed
                      if ((it.edit?.trimStart ?? 0) > 0 && v.currentTime < (it.edit?.trimStart ?? 0)) {
                        v.currentTime = it.edit?.trimStart ?? 0
                      }
                    }}
                    onPlay={(e) => {
                      if (soundSeg) {
                        playSound(drop.sound_preview_url!, soundSeg, Math.max(0, e.currentTarget.currentTime - (it.edit?.trimStart ?? 0)), it.edit?.soundVolume)
                      }
                    }}
                    onPause={() => {
                      if (soundSeg && isCurrentSound(drop.sound_preview_url!, soundSeg)) pauseSound()
                    }}
                    onSeeked={(e) => {
                      if (soundSeg && isCurrentSound(drop.sound_preview_url!, soundSeg) && getSoundSnapshot().playing) {
                        playSound(drop.sound_preview_url!, soundSeg, Math.max(0, e.currentTarget.currentTime - (it.edit?.trimStart ?? 0)), it.edit?.soundVolume)
                      }
                    }}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget
                      const pos = Math.max(0, v.currentTime - (it.edit?.trimStart ?? 0))
                      setVideoPos((m) =>
                        Math.abs((m[it.url] ?? 0) - pos) > 0.15 ? { ...m, [it.url]: pos } : m,
                      )
                      // Deleted takes: skip cut ranges; the song
                      // resyncs at the loop point, drift is bounded.
                      const jump = cutEndAt(it.edit?.cuts, v.currentTime)
                      if (jump != null && (it.edit?.trimEnd == null || jump < it.edit.trimEnd)) {
                        v.currentTime = jump
                        return
                      }
                      if (it.edit?.trimEnd != null && v.currentTime >= it.edit.trimEnd) {
                        v.currentTime = it.edit.trimStart ?? 0
                        if (soundSeg && getSoundSnapshot().playing) {
                          playSound(drop.sound_preview_url!, soundSeg, 0, it.edit?.soundVolume)
                        }
                      }
                    }}
                    onEnded={(e) => {
                      const v = e.currentTarget
                      v.currentTime = it.edit?.trimStart ?? 0
                      v.play().catch(() => {})
                      if (soundSeg && getSoundSnapshot().playing) {
                        playSound(drop.sound_preview_url!, soundSeg, 0, it.edit?.soundVolume)
                      }
                    }}
                  />
                  {(it.edit?.texts ?? [])
                    .filter((t) => textVisibleAt(t, videoPos[it.url] ?? 0))
                    .map((t) => (
                    <span
                      key={t.id}
                      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-black"
                      style={{
                        left: `${t.x * 100}%`,
                        top: `${t.y * 100}%`,
                        ...overlayTextStyle(t, 0),
                        fontSize: `${7 * t.scale}cqw`,
                      }}
                    >
                      {t.text}
                    </span>
                  ))}
                </span>
              ) : isArtworkUrl(it.url) ? (
                <ArtworkImage
                  src={it.url}
                  alt={drop.title}
                  className={
                    drop.category === 'music'
                      ? 'aspect-square w-full max-h-[420px]'
                      : 'aspect-[2/3] w-full max-h-[420px]'
                  }
                />
              ) : (
                <img src={it.url} alt={drop.title} className="max-h-[420px] w-full object-cover" />
              )
            }
          />
        </div>
      )}

      <div className="px-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => author && navigate(`/profile/${author.id}`)}>
              <Avatar url={author?.avatar_url ?? null} name={author?.display_name ?? author?.username ?? '?'} size={48} />
            </button>
            <div>
              <div className="font-bold">{author?.display_name || author?.username}</div>
              <div className="text-sm text-mute">
                @{author?.username} · {timeAgo(drop.created_at)}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {author && !isOwner && <FollowButton followeeId={author.id} />}
            {author && !isOwner && (
              <DropMenu drop={drop} onBlocked={() => navigate('/')} />
            )}
          </div>
        </div>

        <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight">{drop.title}</h1>
        {relatedCount != null && (
          <button
            onClick={() =>
              navigate(`/topic/${encodeURIComponent(drop.topic_key ?? topicKeyFor(drop))}`)
            }
            className="press mt-3 inline-flex items-center gap-2 rounded-full border border-sig/40 bg-sig/10 px-4 py-2 text-sm font-black text-sig"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-2M7 8h2m-2 0a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-2" />
            </svg>
            {relatedCount} put-on{relatedCount === 1 ? '' : 's'} about this
          </button>
        )}
        {(drop.score != null || drop.imdb_rating != null || drop.spotify_popularity != null) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {drop.score != null && (
              <div className="inline-flex items-center gap-2 rounded-full border border-sig/50 bg-sig/10 px-4 py-1.5">
                <span className="text-xl font-black text-sig">{drop.score}</span>
                <span className="text-xs font-bold text-mute">/10 — {author?.display_name ?? author?.username ?? 'author'}'s call</span>
              </div>
            )}
            {drop.imdb_rating != null && (
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2 px-4 py-1.5">
                <span className="text-xl font-black">IMDb {drop.imdb_rating}</span>
              </div>
            )}
            {drop.spotify_popularity != null && (
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2 px-4 py-1.5">
                <span className="text-xl font-black">
                  Deezer {drop.spotify_popularity}
                </span>
              </div>
            )}
          </div>
        )}
        <p className="mt-2 text-[17px] leading-relaxed">
          <span className="font-bold text-sig">Hear me out — </span>
          <MentionText text={drop.description ?? ''} />
        </p>
        {(drop.street_address || drop.neighborhood || drop.city) && (
          <div className="mt-3 rounded-2xl border border-line bg-ink-2 p-4">
            {drop.street_address && <div className="font-bold">{drop.street_address}</div>}
            <div className="text-sm text-mute">
              {[drop.neighborhood, drop.city].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}
        {drop.category === 'recipes' && (drop.ingredients.length > 0 || drop.instructions.length > 0) && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-line">
            {drop.ingredients.length > 0 && (
              <div className="bg-ink-2 p-4">
                <div className="mb-2 text-xs font-black uppercase tracking-widest text-sig">
                  Ingredients · {drop.ingredients.length}
                </div>
                <ul className="space-y-1.5">
                  {drop.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-start gap-2 text-[15px]">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sig" />
                      <span>{ing}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {drop.instructions.length > 0 && (
              <div className="border-t border-line bg-ink p-4">
                <div className="mb-2 text-xs font-black uppercase tracking-widest text-sig">
                  Steps · {drop.instructions.length}
                </div>
                <ol className="space-y-2.5">
                  {drop.instructions.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sig text-xs font-black text-ink">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
        {drop.tip && (
          <div className="mt-3 rounded-2xl border border-sig/40 bg-ink-2 p-4">
            <div className="mb-1 text-xs font-black uppercase tracking-widest text-sig">
              Trust me{author ? ` — hear ${author.display_name ?? author.username} out` : ''}
            </div>
            <p className="text-sm">{drop.tip}</p>
          </div>
        )}
        {drop.where_to && (
          <p className="mt-3 text-sm text-mute">
            <span className="font-bold text-fog">Where to find it: </span>
            {drop.where_to}
          </p>
        )}

        <LinkChips drop={drop} />

        {drop.sound_preview_url && dropMedia(drop).length === 0 && (
          <div className="mt-3">
            <SoundChip
              title={drop.sound_title ?? 'Soundtrack'}
              artist={drop.sound_artist}
              coverUrl={drop.sound_cover_url}
              previewUrl={drop.sound_preview_url}
              start={drop.sound_start_sec ?? 0}
              end={drop.sound_end_sec}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              setSaveError(null)
              void toggleSave()
            }}
            disabled={saveBusy}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition disabled:opacity-50 ${
              saved ? 'bg-sig text-ink' : 'border border-line bg-ink-2 text-fog hover:border-sig'
            }`}
          >
            <TallyIcon saved={saved} className="h-4 w-4" />
            {saved ? 'Tallied' : 'Tally'} · {stats.saves}
          </button>
          {!!user && user.id !== drop.author_id && <ReminderButton dropId={drop.id} />}
          {saveError && <p className="w-full text-xs font-bold text-miss">{saveError}</p>}
          {pinError && (
            <p className="w-full text-xs font-bold text-miss">Could not update your pin — try again.</p>
          )}
          <button
            onClick={copyLink}
            className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-sig"
          >
            {copied ? 'Link copied ✓' : 'Share'}
          </button>
          <button
            onClick={exportCard}
            disabled={cardBusy}
            className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-sig disabled:opacity-50"
          >
            {cardBusy ? 'Rendering…' : 'Share taste card'}
          </button>
          {isOwner && (
            <>
              <button
                onClick={togglePin}
                disabled={pinBusy}
                className={`rounded-full border px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                  isPinned
                    ? 'border-sig bg-sig/15 text-sig'
                    : 'border-line bg-ink-2 text-fog hover:border-sig'
                }`}
              >
                {isPinned ? 'Pinned to profile ✓' : 'Pin to profile'}
              </button>
              <button
                onClick={() => setListing(true)}
                className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-sig"
              >
                Add to list
              </button>
              <button
                onClick={() => navigate(`/edit/${drop.id}`)}
                className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-sig"
              >
                Edit
              </button>
              <button
                onClick={remove}
                disabled={deleting}
                className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-miss hover:border-miss disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          )}
        </div>

        <div className="mt-6">
          <VerdictBox drop={drop} stats={stats} myVerdict={myVerdict} onChanged={load} />
          {authorRate && (
            <p className="mt-2 text-center text-xs text-mute">
              @{author?.username}'s record: <span className="font-bold text-sig">{authorRate}</span>
            </p>
          )}
        </div>

        {!!user && user.id === drop.author_id && (
          <div className="mt-3 rounded-2xl border border-line bg-ink-2 px-4 py-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-mute">Your drop</div>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-bold text-fog">
              <span>{viewCount ?? '–'} views</span>
              <span className="text-mute/50">·</span>
              <span>{stats.saves} tallies</span>
              <span className="text-mute/50">·</span>
              <span>{stats.tried} tried</span>
              <span className="text-mute/50">·</span>
              <span>
                <span className="text-win">{stats.wins} W</span>
                <span className="text-mute"> – </span>
                <span className="text-miss">{stats.losses} L</span>
              </span>
            </div>
            <p className="mt-1 text-[10px] text-mute">Views count from today onward — only you see this.</p>
            {talliers.length > 0 && (
              <div className="mt-2.5 flex items-center justify-center gap-2">
                <div className="flex -space-x-2">
                  {talliers.slice(0, 10).map((p) => (
                    <button key={p.id} onClick={() => navigate(`/profile/${p.id}`)} aria-label={`@${p.username}`} className="rounded-full ring-2 ring-ink-2">
                      <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={26} />
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-bold text-mute">
                  Tallied by {talliers.slice(0, 2).map((p) => `@${p.username}`).join(', ')}
                  {talliers.length > 2 ? ` +${talliers.length - 2}` : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {proofs.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-black">Receipts</h2>
            <div className="rail-scroll flex gap-3 overflow-x-auto pb-1">
              {proofs.map(({ verdict: v, profile: p }) => (
                <div key={v.id} className="w-[104px] shrink-0">
                  <button onClick={() => setProofView(v.proof_url)} className="block">
                    <img
                      src={v.proof_url ?? ''}
                      alt={`Proof from @${p?.username ?? 'a voter'}`}
                      loading="lazy"
                      className="h-[104px] w-[104px] rounded-2xl object-cover"
                    />
                  </button>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    {v.verdict && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-black ${
                          v.verdict === 'W' ? 'bg-win text-ink' : 'bg-miss text-white'
                        }`}
                      >
                        {v.verdict}
                      </span>
                    )}
                    <span className="truncate text-mute">@{p?.username ?? '?'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {callNotes.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-black">The calls</h2>
            <ul className="space-y-2">
              {callNotes.map(({ verdict: v, profile: p }) => (
                <li key={v.id} className="flex items-start gap-2.5 rounded-2xl border border-line bg-ink-2 px-3.5 py-2.5">
                  {v.verdict && (
                    <span
                      className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black ${
                        v.verdict === 'W' ? 'bg-win text-ink' : 'bg-miss text-white'
                      }`}
                    >
                      {v.verdict}
                    </span>
                  )}
                  <span className="min-w-0 text-sm">
                    <span className="mr-1.5 font-bold text-sig">@{p?.username ?? '?'}</span>
                    <span className="text-fog">{v.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">
          <Comments
            dropId={drop.id}
            authorId={drop.author_id}
            onCountChange={(n) => setStats((s) => ({ ...s, comments: n }))}
          />
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-lg font-black">The put-on chain</h2>
          <PutOnChain drop={drop} />
        </div>

        <RelatedDrops drop={drop} />

        {proofView && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setProofView(null)}
          >
            <img src={proofView} alt="Proof, full size" className="max-h-full max-w-full rounded-2xl object-contain" />
          </div>
        )}
        {listing && <AddToListSheet dropId={drop.id} onClose={() => setListing(false)} />}

        {!user && (
          <div className="mt-8 rounded-3xl border border-sig/50 bg-ink-2 p-6 text-center">
            <h3 className="mb-2 text-xl font-black">Don't sleep on this</h3>
            <p className="mb-4 text-sm text-mute">
              Join Peak to save this drop, try it, and put your own W/L on the record.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="rounded-full bg-sig px-8 py-3 font-black text-ink"
            >
              See more drops
            </button>
          </div>
        )}

        {profile && !isOwner && (
          <p className="mt-6 text-center text-xs text-mute">Signed in as @{profile.username}</p>
        )}
      </div>
    </div>
  )
}
