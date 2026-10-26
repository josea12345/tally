import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, navigate } from '../App'
import { notify } from '../lib/notify'
import { useBadges } from '../lib/useBadges'
import { getPushState, subscribePush, unsubscribePush, type PushState } from '../lib/push'
import { getChoice, setChoice, type ThemeChoice } from '../lib/theme'
import { deleteAccount } from '../lib/account'
import { deleteDropFiles, fetchVerdictProofUrls } from '../lib/media'
import { timeAgo } from '../lib/format'
import { requestWalkthroughReplay } from '../lib/walkthrough'

interface FollowRequest {
  follower_id: string
  created_at: string
  follower: { username: string; display_name: string | null; avatar_url: string | null }
}

interface BlockedRow {
  blocked_id: string
  created_at: string
  blocked: { username: string; display_name: string | null; avatar_url: string | null }
}

interface ReportRow {
  id: string
  reason: string
  details: string | null
  created_at: string
  drop_id: string | null
  comment_id: string | null
  reported_user_id: string | null
  reporterName: string
  dropTitle: string | null
  reportedName: string | null
  commentBody: string | null
  commentDropId: string | null
}

export default function Settings() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const [isPrivate, setIsPrivate] = useState(profile?.is_private ?? false)
  const [requests, setRequests] = useState<FollowRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>(profile?.dismissed_badges ?? [])
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(getChoice())
  const [prefs, setPrefs] = useState({ wl: true, follows: true, comments: true })

  useEffect(() => {
    if (profile) {
      setPrefs({
        wl: profile.notify_wl ?? true,
        follows: profile.notify_follows ?? true,
        comments: profile.notify_comments ?? true,
      })
    }
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePref = async (key: 'wl' | 'follows' | 'comments') => {
    if (!user) return
    const col = key === 'wl' ? 'notify_wl' : key === 'follows' ? 'notify_follows' : 'notify_comments'
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    const { error } = await supabase.from('profiles').update({ [col]: next[key] }).eq('id', user.id)
    if (error) setPrefs(prefs) // migration not run yet — revert
    else refreshProfile()
  }
  const badges = useBadges(user?.id)
  const [blocked, setBlocked] = useState<BlockedRow[]>([])

  const restoreBadge = async (id: string) => {
    if (!user) return
    const next = dismissed.filter((d) => d !== id)
    setDismissed(next)
    await supabase.from('profiles').update({ dismissed_badges: next }).eq('id', user.id)
    refreshProfile()
  }

  const unblock = async (blockedId: string) => {
    if (!user) return
    await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId)
    setBlocked((b) => b.filter((x) => x.blocked_id !== blockedId))
  }

  const [copied, setCopied] = useState(false)
  const [pushState, setPushState] = useState<PushState>('busy')
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  useEffect(() => {
    getPushState().then(setPushState)
  }, [])

  const togglePush = async () => {
    if (!user || pushState === 'busy' || pushState === 'denied' || pushState === 'unsupported' || pushState === 'unconfigured') return
    if (pushState === 'on') {
      setPushState('busy')
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        const endpoint = sub?.endpoint
        await unsubscribePush()
        if (endpoint) {
          await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
        }
      } finally {
        setPushState('off')
      }
    } else {
      setPushState('busy')
      const json = await subscribePush()
      if (json?.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await supabase.from('push_subscriptions').upsert(
          {
            user_id: user.id,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          { onConflict: 'user_id,endpoint' }
        )
        setPushState('on')
      } else {
        setPushState(await getPushState())
      }
    }
  }
  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(profile?.username ?? '')}#/auth`
      : 'https://tally-rho-ten.vercel.app'
  const inviteText = `I'm on Peak — good taste deserves a track record. Come get put on: ${inviteUrl}`

  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Peak', text: inviteText, url: inviteUrl })
      } catch {
        /* user dismissed the sheet */
      }
    } else {
      copyInvite()
    }
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
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
        if (live) setRequests((data ?? []) as unknown as FollowRequest[])
      })
    supabase
      .from('blocks')
      .select('blocked_id, created_at, blocked:profiles!blocks_blocked_id_fkey(username, display_name, avatar_url)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (live) setBlocked((data ?? []) as unknown as BlockedRow[])
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

  // --- Admin reports inbox (only rendered for is_admin accounts) ----------
  const [reports, setReports] = useState<ReportRow[] | null>(null)
  const [actingReport, setActingReport] = useState<string | null>(null)
  const dismissReport = async (r: ReportRow) => {
    setActingReport(r.id)
    const { error } = await supabase.from('reports').update({ status: 'dismissed' }).eq('id', r.id)
    if (!error) setReports((rs) => (rs ?? []).filter((x) => x.id !== r.id))
    setActingReport(null)
  }
  const deleteReportedDrop = async (r: ReportRow) => {
    if (!r.drop_id) return
    setActingReport(r.id)
    // Fetch media fields + verdict proofs first so the drop's files
    // can be removed with it (best effort — storage policies may
    // still refuse for another user's files, which is fine).
    const [{ data: dropRow }, proofUrls] = await Promise.all([
      supabase
        .from('drops')
        .select('id, media_url, media_urls, media_poster_url, media_poster_urls')
        .eq('id', r.drop_id)
        .maybeSingle(),
      fetchVerdictProofUrls(r.drop_id),
    ])
    const { error } = await supabase.from('drops').delete().eq('id', r.drop_id)
    if (!error) {
      if (dropRow) void deleteDropFiles(dropRow, proofUrls)
      await supabase.from('reports').update({ status: 'actioned' }).eq('id', r.id)
      setReports((rs) => (rs ?? []).filter((x) => x.id !== r.id))
    }
    setActingReport(null)
  }
  const deleteReportedComment = async (r: ReportRow) => {
    if (!r.comment_id) return
    setActingReport(r.id)
    const { error } = await supabase.from('comments').delete().eq('id', r.comment_id)
    if (!error) {
      await supabase.from('reports').update({ status: 'actioned' }).eq('id', r.id)
      setReports((rs) => (rs ?? []).filter((x) => x.id !== r.id))
    }
    setActingReport(null)
  }
  useEffect(() => {
    if (!profile?.is_admin) return
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('reports')
        .select('id, reason, details, created_at, drop_id, comment_id, reported_user_id, reporter_id')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!live) return
      const rows = (data ?? []) as Array<{
        id: string
        reason: string
        details: string | null
        created_at: string
        drop_id: string | null
        comment_id: string | null
        reported_user_id: string | null
        reporter_id: string
      }>
      const userIds = [...new Set(rows.flatMap((r) => [r.reporter_id, r.reported_user_id]).filter(Boolean))] as string[]
      const dropIds = [...new Set(rows.map((r) => r.drop_id).filter(Boolean))] as string[]
      const commentIds = [...new Set(rows.map((r) => r.comment_id).filter(Boolean))] as string[]
      const [{ data: profs }, { data: drps }, { data: cmts }] = await Promise.all([
        userIds.length
          ? supabase.from('profiles').select('id, username').in('id', userIds)
          : Promise.resolve({ data: [] as Array<{ id: string; username: string }> }),
        dropIds.length
          ? supabase.from('drops').select('id, title').in('id', dropIds)
          : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
        commentIds.length
          ? supabase.from('comments').select('id, body, drop_id').in('id', commentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; body: string; drop_id: string }> }),
      ])
      if (!live) return
      const nameOf = new Map(((profs ?? []) as Array<{ id: string; username: string }>).map((p) => [p.id, p.username]))
      const titleOf = new Map(((drps ?? []) as Array<{ id: string; title: string }>).map((d) => [d.id, d.title]))
      const commentOf = new Map(
        ((cmts ?? []) as Array<{ id: string; body: string; drop_id: string }>).map((c) => [c.id, c]),
      )
      setReports(
        rows.map((r) => ({
          ...r,
          reporterName: nameOf.get(r.reporter_id) ?? 'unknown',
          dropTitle: r.drop_id ? (titleOf.get(r.drop_id) ?? null) : null,
          reportedName: r.reported_user_id ? (nameOf.get(r.reported_user_id) ?? null) : null,
          commentBody: r.comment_id ? (commentOf.get(r.comment_id)?.body ?? null) : null,
          commentDropId: r.comment_id ? (commentOf.get(r.comment_id)?.drop_id ?? null) : null,
        }))
      )
    })()
    return () => {
      live = false
    }
  }, [profile?.is_admin])

  // --- Change password -------------------------------------------------------
  const [newPassword, setNewPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const changePassword = async () => {
    if (passwordBusy || newPassword.length < 8) return
    setPasswordBusy(true)
    setPasswordMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordBusy(false)
    if (error) {
      setPasswordMsg({ ok: false, text: 'Could not update — try again in a moment.' })
    } else {
      setNewPassword('')
      setPasswordMsg({ ok: true, text: 'Password updated.' })
    }
  }

  // --- Download my data ------------------------------------------------------
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const downloadMyData = async () => {
    if (!user || exporting) return
    setExporting(true)
    setExportError(null)
    try {
      const [prof, drps, vrds, cmts, svs, cols] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('drops').select('*').eq('author_id', user.id).order('created_at', { ascending: false }).limit(2000),
        supabase.from('verdicts').select('*').eq('user_id', user.id).limit(5000),
        supabase.from('comments').select('*').eq('user_id', user.id).limit(5000),
        supabase.from('saves').select('*').eq('user_id', user.id).limit(5000),
        supabase.from('collections').select('*').eq('owner_id', user.id).limit(500),
      ])
      const myCols = (cols.data ?? []) as Array<{ id: string }>
      let items: unknown[] = []
      if (myCols.length > 0) {
        const { data } = await supabase
          .from('collection_items')
          .select('*')
          .in('collection_id', myCols.map((c) => c.id))
          .limit(5000)
        items = data ?? []
      }
      const payload = {
        exported_at: new Date().toISOString(),
        profile: prof.data ?? null,
        drops: drps.data ?? [],
        verdicts: vrds.data ?? [],
        comments: cmts.data ?? [],
        tallies: svs.data ?? [],
        collections: myCols,
        collection_items: items,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tally-export-${profile?.username ?? 'me'}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch {
      setExportError('Export failed — try again.')
    } finally {
      setExporting(false)
    }
  }

  // --- Delete account ------------------------------------------------------
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const doDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    const { error } = await deleteAccount()
    if (error) {
      setDeleteError(error)
      setDeleting(false)
      return
    }
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
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${isPrivate ? 'bg-sig' : 'bg-ink-3'}`}
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
              Follow requests {requests.length > 0 && <span className="text-sig">· {requests.length}</span>}
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
                      className="rounded-full bg-sig px-4 py-1.5 text-xs font-black text-ink"
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

      {/* invite */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Invite friends</h2>
        <div className="rounded-2xl border border-sig/40 bg-sig/5 p-4">
          <p className="text-sm font-bold">Taste is better with your people.</p>
          <p className="mt-1 text-xs leading-relaxed text-mute">
            Put your friends on — the more of your circle that's here, the faster the ratings roll in.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={shareInvite}
              className="press flex-1 rounded-full bg-sig py-2.5 text-sm font-black text-ink"
            >
              Share invite
            </button>
            <button
              onClick={copyInvite}
              className="press flex-1 rounded-full border border-line py-2.5 text-sm font-black text-fog transition hover:border-sig hover:text-sig"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      </section>

      {/* appearance */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Appearance</h2>
        <div className="rounded-2xl border border-line bg-ink-2 p-4">
          <div className="grid grid-cols-3 gap-2">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setChoice(t)
                  setThemeChoice(t)
                }}
                className={`rounded-xl border py-2.5 text-sm font-black capitalize transition ${
                  themeChoice === t
                    ? 'border-sig bg-sig/10 text-sig'
                    : 'border-line text-mute hover:text-fog'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-mute">System follows your phone's light/dark setting.</p>
        </div>
      </section>

      {/* push notifications */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Notifications</h2>
        <div className="rounded-2xl border border-line bg-ink-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold">Push notifications</div>
              <div className="mt-0.5 text-xs leading-relaxed text-mute">
                Peaks, follows, and comments — even when Peak is closed.
              </div>
            </div>
            <button
              onClick={togglePush}
              disabled={pushState === 'busy' || pushState === 'denied' || pushState === 'unsupported' || pushState === 'unconfigured'}
              aria-label="Toggle push notifications"
              className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-40 ${
                pushState === 'on' ? 'bg-sig' : 'bg-ink-3'
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
                  pushState === 'on' ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
          {pushState === 'denied' && (
            <p className="mt-2 text-xs text-miss">
              Notifications are blocked — enable them in your browser settings to turn this on.
            </p>
          )}
          {pushState === 'unsupported' && (
            <p className="mt-2 text-xs text-mute">Push isn't supported in this browser.</p>
          )}
          {isIOS && pushState !== 'on' && (
            <p className="mt-2 text-xs text-mute">
              iPhone note: install Peak to your Home Screen first (needs iOS 16.4+), then flip this on.
            </p>
          )}
        </div>
      </section>

      {/* what notifies you */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">What notifies you</h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-ink-2">
          {(
            [
              { key: 'wl', title: 'Peaks', body: 'When someone rates your drop a 10 — a mountain.' },
              { key: 'follows', title: 'Followers', body: 'New followers and follow requests.' },
              { key: 'comments', title: 'Comments', body: 'When someone comments on your drops.' },
            ] as const
          ).map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-bold">{row.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-mute">{row.body}</div>
              </div>
              <button
                onClick={() => togglePref(row.key)}
                aria-label={`Toggle ${row.title} notifications`}
                className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                  prefs[row.key] ? 'bg-sig' : 'bg-ink-3'
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
                    prefs[row.key] ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
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
                    className="press shrink-0 rounded-full border border-sig px-4 py-1.5 text-xs font-black text-sig transition hover:bg-sig hover:text-ink"
                  >
                    Restore
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* blocked accounts */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Blocked accounts</h2>
        {blocked.length === 0 ? (
          <p className="text-sm leading-relaxed text-mute">
            Nobody blocked. Blocked accounts can't see your drops, and you won't see theirs.
          </p>
        ) : (
          <div className="space-y-2">
            {blocked.map((b) => (
              <div key={b.blocked_id} className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3">
                <Avatar url={b.blocked.avatar_url} name={b.blocked.display_name ?? b.blocked.username} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{b.blocked.display_name || `@${b.blocked.username}`}</div>
                  <div className="truncate text-xs text-mute">@{b.blocked.username}</div>
                </div>
                <button
                  onClick={() => unblock(b.blocked_id)}
                  className="press shrink-0 rounded-full border border-line px-4 py-1.5 text-xs font-black text-fog transition hover:border-sig hover:text-sig"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* reports inbox — admin only */}
      {profile?.is_admin && (
        <section className="px-4 pt-8">
          <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Reports</h2>
          {reports === null ? (
            <p className="text-sm text-mute">Loading reports…</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-mute">No reports yet. When someone reports a drop or an account, it lands here.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="rounded-2xl border border-line bg-ink-2 p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-black">{r.reason}</span>
                    <span className="shrink-0 text-[11px] font-bold text-mute">{timeAgo(r.created_at)}</span>
                  </div>
                  {r.details && <p className="mt-1 text-xs leading-relaxed text-fog/85">{r.details}</p>}
                  <p className="mt-1.5 text-[11px] font-bold text-mute">reported by @{r.reporterName}</p>
                  {r.drop_id && (
                    <button
                      onClick={() => navigate(`/drop/${r.drop_id}`)}
                      className="press mt-2 rounded-full border border-sig/50 px-3 py-1 text-xs font-black text-sig"
                    >
                      {r.dropTitle ? `Open drop: ${r.dropTitle}` : 'Open drop'}
                    </button>
                  )}
                  {r.comment_id && (
                    <div className="mt-2 rounded-xl bg-ink-3 px-3 py-2">
                      <p className="text-xs leading-relaxed text-fog/90">
                        “{r.commentBody ?? '(comment already gone)'}”
                      </p>
                      {r.commentDropId && (
                        <button
                          onClick={() => navigate(`/drop/${r.commentDropId}`)}
                          className="press mt-1.5 text-[11px] font-black text-sig"
                        >
                          Open the drop →
                        </button>
                      )}
                    </div>
                  )}
                  {r.reported_user_id && (
                    <button
                      onClick={() => navigate(`/profile/${r.reported_user_id}`)}
                      className="press mt-2 rounded-full border border-sig/50 px-3 py-1 text-xs font-black text-sig"
                    >
                      Reported account: @{r.reportedName ?? 'unknown'}
                    </button>
                  )}
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <button
                      onClick={() => dismissReport(r)}
                      disabled={actingReport === r.id}
                      className="press flex-1 rounded-full border border-line py-2 text-xs font-black disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    {r.drop_id && !r.comment_id && (
                      <button
                        onClick={() => deleteReportedDrop(r)}
                        disabled={actingReport === r.id}
                        className="press flex-1 rounded-full bg-miss py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        {actingReport === r.id ? 'Working…' : 'Delete drop'}
                      </button>
                    )}
                    {r.comment_id && (
                      <button
                        onClick={() => deleteReportedComment(r)}
                        disabled={actingReport === r.id}
                        className="press flex-1 rounded-full bg-miss py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        {actingReport === r.id ? 'Working…' : 'Delete comment'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* walkthrough */}
      <section className="px-4 pt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-mute">Walkthrough</h2>
        <button
          onClick={requestWalkthroughReplay}
          className="w-full rounded-2xl border border-line bg-ink-2 py-3.5 text-base font-black text-fog transition hover:border-sig"
        >
          Replay the walkthrough
        </button>
        <p className="mt-2 text-xs leading-relaxed text-mute">
          The quick tour from when you joined — put-ons, rating, Try, Lists and requests, all in under a minute.
        </p>
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

        <div className="mt-5 rounded-2xl border border-line bg-ink-2 p-4">
          <p className="text-sm font-black">Change password</p>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value)
                setPasswordMsg(null)
              }}
              placeholder="New password (8+ characters)"
              autoComplete="new-password"
              className="min-w-0 flex-1 rounded-full border border-line bg-ink px-4 py-2 text-sm outline-none focus:border-sig"
            />
            <button
              onClick={changePassword}
              disabled={newPassword.length < 8 || passwordBusy}
              className="shrink-0 rounded-full bg-sig px-4 py-2 text-sm font-black text-ink disabled:opacity-40"
            >
              {passwordBusy ? 'Saving…' : 'Update'}
            </button>
          </div>
          {passwordMsg && (
            <p className={`mt-2 text-xs font-bold ${passwordMsg.ok ? 'text-win' : 'text-miss'}`}>
              {passwordMsg.text}
            </p>
          )}
        </div>

        {confirmingDelete ? (
          <div className="mt-5 rounded-2xl border border-miss/60 bg-miss/10 p-4">
            <p className="text-sm font-black text-miss">Delete your account permanently?</p>
            <p className="mt-1 text-xs leading-relaxed text-mute">
              Every drop, rating, comment and save goes with it. There is no undo.
            </p>
            {deleteError && <p className="mt-2 text-xs font-bold text-miss">{deleteError}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={doDelete}
                disabled={deleting}
                className="press flex-1 rounded-full bg-miss py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="press flex-1 rounded-full border border-line py-2.5 text-sm font-black"
              >
                Keep my account
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={downloadMyData}
              disabled={exporting}
              className="press mt-5 w-full rounded-2xl border border-line py-3 text-sm font-black text-fog disabled:opacity-50"
            >
              {exporting ? 'Preparing…' : 'Download my data (JSON)'}
            </button>
            {exportError && <p className="mt-2 text-center text-xs font-bold text-miss">{exportError}</p>}
            <button
              onClick={() => setConfirmingDelete(true)}
              className="press mt-3 w-full rounded-2xl border border-miss/30 py-3 text-sm font-black text-miss/80"
            >
              Delete account
            </button>
          </>
        )}
      </section>
    </div>
  )
}
