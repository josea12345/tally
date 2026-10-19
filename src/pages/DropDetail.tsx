import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Drop, DropStats, Verdict } from '../lib/types'
import { timeAgo } from '../lib/format'
import { Avatar, navigate } from '../App'
import VerdictBox from '../components/VerdictBox'
import PutOnChain from '../components/PutOnChain'
import Comments from '../components/Comments'
import LinkChips from '../components/LinkChips'
import MediaCarousel from '../components/MediaCarousel'
import DropMenu from '../components/DropMenu'
import { dropMedia } from '../lib/types'
import EmptyState from '../components/EmptyState'
import FollowButton from '../components/FollowButton'
import TallyIcon from '../components/TallyIcon'
import { renderTasteCard, shareTasteCard } from '../lib/tastecard'
import { WIN_RATE_MINIMUM } from '../lib/stats'

export default function DropDetail({ id }: { id: string }) {
  const { user, profile } = useAuth()
  const [drop, setDrop] = useState<Drop | null>(null)
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
      <button onClick={() => navigate('/')} className="btn-pop press px-6 py-2.5 text-sm">
        Back to Discover
      </button>
    } />
  }

  const author = drop.author
  const isOwner = user?.id === drop.author_id

  return (
    <div className="pb-8">
      {!user && (
        <div className="border-b border-line bg-sig px-4 py-3 text-center">
          <p className="text-sm font-black text-ink">
            Someone put you on — join TALLY to save it and call W or L.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="mt-2 rounded-full bg-ink px-6 py-2 text-sm font-black text-sig"
          >
            Join TALLY
          </button>
        </div>
      )}

      {dropMedia(drop).length > 0 && (
        <div className="border-b border-line px-4 py-3">
          <MediaCarousel
            items={dropMedia(drop)}
            renderItem={(it) =>
              it.type === 'video' ? (
                <video src={it.url} poster={it.posterUrl ?? undefined} controls playsInline preload="metadata" className="max-h-[420px] w-full bg-black" />
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
        {(drop.score != null || drop.imdb_rating != null) && (
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
          </div>
        )}
        <p className="mt-2 text-[17px] leading-relaxed">
          <span className="font-bold text-sig">Hear me out — </span>
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
          {saveError && <p className="w-full text-xs font-bold text-miss">{saveError}</p>}
          <button
            onClick={copyLink}
            className="rounded-full border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-fog hover:border-sig"
          >
            {copied ? 'Link copied ✓' : 'Copy link'}
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

        {!user && (
          <div className="mt-8 rounded-3xl border border-sig/50 bg-ink-2 p-6 text-center">
            <h3 className="mb-2 text-xl font-black">Don't sleep on this</h3>
            <p className="mb-4 text-sm text-mute">
              Join TALLY to save this drop, try it, and put your own W/L on the record.
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
