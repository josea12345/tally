import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, DropStats, Verdict } from '../lib/types'
import { timeAgo } from '../lib/format'
import { Avatar, navigate } from '../App'
import VerdictBox from '../components/VerdictBox'
import PutOnChain from '../components/PutOnChain'
import LinkChips from '../components/LinkChips'
import EmptyState from '../components/EmptyState'
import FollowButton from '../components/FollowButton'
import { renderTasteCard, shareTasteCard } from '../lib/tastecard'
import { winRateFor } from '../lib/stats'

export default function DropDetail({ id }: { id: string }) {
  const { user, profile } = useAuth()
  const [drop, setDrop] = useState<Drop | null>(null)
  const [stats, setStats] = useState<DropStats>({ saves: 0, wins: 0, losses: 0, tried: 0 })
  const [myVerdict, setMyVerdict] = useState<Verdict | null>(null)
  const [saved, setSaved] = useState(false)
  const [verdicts, setVerdicts] = useState<Verdict[]>([])
  const [authorRate, setAuthorRate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cardBusy, setCardBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: dErr } = await supabase
        .from('drops')
        .select('*, author:profiles(*)')
        .eq('id', id)
        .maybeSingle()
      if (dErr) throw dErr
      if (!data) {
        setError('This drop is gone — it may have been deleted.')
        return
      }
      const d = data as Drop
      setDrop(d)

      const [{ data: saves }, { data: vts }] = await Promise.all([
        supabase.from('saves').select('id').eq('drop_id', id).limit(5000),
        supabase.from('verdicts').select('*').eq('drop_id', id).limit(5000),
      ])
      const vlist = (vts ?? []) as Verdict[]
      setVerdicts(vlist)
      setStats({
        saves: (saves ?? []).length,
        wins: vlist.filter((v) => v.verdict === 'W').length,
        losses: vlist.filter((v) => v.verdict === 'L').length,
        tried: vlist.filter((v) => v.tried).length,
      })

      if (user) {
        const [{ data: mine }, { data: mySave }] = await Promise.all([
          supabase.from('verdicts').select('*').eq('drop_id', id).eq('user_id', user.id).maybeSingle(),
          supabase.from('saves').select('id').eq('drop_id', id).eq('user_id', user.id).maybeSingle(),
        ])
        setMyVerdict((mine as Verdict | null) ?? null)
        setSaved(!!mySave)
      }

      // author's live hit rate for the payoff banner
      const { data: authorDrops } = await supabase.from('drops').select('id').eq('author_id', d.author_id).limit(2000)
      const aIds = ((authorDrops ?? []) as Array<{ id: string }>).map((x) => x.id)
      if (aIds.length > 0) {
        const { data: aVerdicts } = await supabase
          .from('verdicts')
          .select('verdict')
          .in('drop_id', aIds)
          .limit(5000)
        const hr = winRateFor((aVerdicts ?? []) as Verdict[])
        setAuthorRate(
          hr.rate == null ? null : `${Math.round(hr.rate * 100)}% win rate · ${hr.total} verdicts`
        )
      }
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
    if (!user) {
      navigate('/auth')
      return
    }
    if (!drop) return
    if (saved) {
      await supabase.from('saves').delete().eq('user_id', user.id).eq('drop_id', drop.id)
      setSaved(false)
      setStats((s) => ({ ...s, saves: s.saves - 1 }))
    } else {
      await supabase.from('saves').insert({ user_id: user.id, drop_id: drop.id })
      setSaved(true)
      setStats((s) => ({ ...s, saves: s.saves + 1 }))
    }
  }

  const shareUrl = () => `${window.location.origin}${window.location.pathname}#/drop/${id}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  const exportCard = async () => {
    if (!drop?.author) return
    setCardBusy(true)
    try {
      const blob = await renderTasteCard(drop, drop.author.display_name ?? drop.author.username, drop.author.username, verdicts)
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
      await supabase.from('drops').delete().eq('id', drop.id)
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
      <button onClick={() => navigate('/')} className="rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink">
        Back to Discover
      </button>
    } />
  }

  const author = drop.author
  const isOwner = user?.id === drop.author_id

  return (
    <div className="pb-8">
      {!user && (
        <div className="border-b border-line bg-lime px-4 py-3 text-center">
          <p className="text-sm font-black text-ink">
            Someone put you on — join TALLY to save it and call W or L.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="mt-2 rounded-full bg-ink px-6 py-2 text-sm font-black text-lime"
          >
            Join TALLY
          </button>
        </div>
      )}

      {drop.media_url && (
        <div className="border-b border-line">
          {drop.media_type === 'video' ? (
            <video src={drop.media_url} controls playsInline preload="metadata" className="max-h-[420px] w-full bg-black" />
          ) : (
            <img src={drop.media_url} alt={drop.title} className="max-h-[420px] w-full object-cover" />
          )}
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
          {author && !isOwner && <FollowButton followeeId={author.id} />}
        </div>

        <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight">{drop.title}</h1>
        <p className="mt-2 text-[17px] leading-relaxed">
          <span className="font-bold text-lime">Hear me out — </span>
          {drop.description}
        </p>
        {(drop.street_address || drop.neighborhood || drop.city) && (
          <div className="mt-3 rounded-2xl border border-line bg-ink-2 p-4">
            {drop.street_address && <div className="font-bold">{drop.street_address}</div>}
            <div className="text-sm text-mute">
              {[drop.neighborhood, drop.city].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}
        {drop.tip && (
          <div className="mt-3 rounded-2xl border border-lime/40 bg-ink-2 p-4">
            <div className="mb-1 text-xs font-black uppercase tracking-widest text-lime">
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

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={toggleSave}
            className={`rounded-full px-4 py-2 text-sm font-black transition ${
              saved ? 'bg-lime text-ink' : 'border border-line bg-ink-2 text-fog hover:border-lime'
            }`}
          >
            {saved ? '♥ Saved' : '♡ Save'} · {stats.saves}
          </button>
          <button
            onClick={copyLink}
            className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-lime"
          >
            {copied ? 'Link copied ✓' : 'Copy link'}
          </button>
          <button
            onClick={exportCard}
            disabled={cardBusy}
            className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-lime disabled:opacity-50"
          >
            {cardBusy ? 'Rendering…' : 'Share taste card'}
          </button>
          {isOwner && (
            <>
              <button
                onClick={() => navigate(`/edit/${drop.id}`)}
                className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-lime"
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
              @{author?.username}'s record: <span className="font-bold text-lime">{authorRate}</span>
            </p>
          )}
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-lg font-black">The put-on chain</h2>
          <PutOnChain drop={drop} />
        </div>

        {!user && (
          <div className="mt-8 rounded-3xl border border-lime/50 bg-ink-2 p-6 text-center">
            <h3 className="mb-2 text-xl font-black">Don't sleep on this</h3>
            <p className="mb-4 text-sm text-mute">
              Join TALLY to save this drop, try it, and put your own W/L on the record.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="rounded-full bg-lime px-8 py-3 font-black text-ink"
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
