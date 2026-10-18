import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { navigate, Avatar } from '../App'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/** Short, polished onboarding: username, display name, bio, avatar, city. */
export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [city, setCity] = useState('Miami')
  const [avail, setAvail] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name)
    if (profile?.city) setCity(profile.city)
  }, [profile])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const v = username.trim().toLowerCase()
    if (!v) {
      setAvail('idle')
      return
    }
    if (!USERNAME_RE.test(v)) {
      setAvail('invalid')
      return
    }
    setAvail('checking')
    timer.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').ilike('username', v).limit(1)
      setAvail(data && data.length > 0 ? 'taken' : 'ok')
    }, 400)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [username])

  const submit = async () => {
    setError(null)
    const v = username.trim().toLowerCase()
    if (!USERNAME_RE.test(v)) {
      setError('Username must be 3–20 characters: lowercase letters, numbers, underscores.')
      return
    }
    if (avail === 'taken') {
      setError('That username is taken — hear me out, try another.')
      return
    }
    if (!displayName.trim()) {
      setError('Give yourself a display name.')
      return
    }
    if (!user) return
    setBusy(true)
    try {
      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          username: v,
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          city: city.trim() || 'Miami',
        })
        .eq('id', user.id)
      if (upErr) throw upErr
      await refreshProfile()
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const availMsg =
    avail === 'checking'
      ? 'Checking…'
      : avail === 'ok'
        ? '✓ Available — claim it.'
        : avail === 'taken'
          ? 'Taken — try another.'
          : avail === 'invalid'
            ? '3–20 chars: a–z, 0–9, _'
            : ''

  return (
    <div className="mx-auto max-w-lg px-6 pb-16 pt-10">
      <div className="mb-2 text-4xl font-black tracking-tight">
        TALLY<span className="text-lime">.</span>
      </div>
      <h1 className="mb-2 text-3xl font-black tracking-tight">Let me put you on…</h1>
      <p className="mb-8 text-mute">Set up your profile. Short and sweet — your taste does the talking.</p>

      <div className="mb-6 flex items-center gap-4">
        <Avatar url={avatarUrl.trim() || null} name={displayName || username || '?'} size={72} />
        <div className="flex-1">
          <label className="mb-1 block text-xs font-bold text-mute">Avatar URL (optional)</label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm outline-none placeholder:text-mute/60 focus:border-lime"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-mute">Username *</label>
          <div className="flex items-center rounded-2xl border border-line bg-ink-2 px-4 focus-within:border-lime">
            <span className="text-mute">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="yourhandle"
              maxLength={20}
              className="w-full bg-transparent px-1 py-3 font-bold outline-none placeholder:text-mute/60"
            />
          </div>
          {availMsg && (
            <p className={`mt-1 text-xs font-bold ${avail === 'ok' ? 'text-lime' : avail === 'taken' || avail === 'invalid' ? 'text-miss' : 'text-mute'}`}>
              {availMsg}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-mute">Display name *</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Name"
            maxLength={60}
            className="w-full rounded-2xl border border-line bg-ink-2 px-4 py-3 outline-none placeholder:text-mute/60 focus:border-lime"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-mute">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="What are you the plug for?"
            rows={2}
            maxLength={160}
            className="w-full resize-none rounded-2xl border border-line bg-ink-2 px-4 py-3 outline-none placeholder:text-mute/60 focus:border-lime"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-mute">City</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Miami"
            maxLength={60}
            className="w-full rounded-2xl border border-line bg-ink-2 px-4 py-3 outline-none placeholder:text-mute/60 focus:border-lime"
          />
        </div>
        {error && <p className="text-sm font-bold text-miss">{error}</p>}
        <button
          onClick={submit}
          disabled={busy || avail === 'taken' || avail === 'checking'}
          className="w-full rounded-full bg-lime py-3.5 font-black text-ink transition hover:bg-lime-dim disabled:opacity-50"
        >
          {busy ? 'Setting you up…' : 'Start dropping'}
        </button>
      </div>
    </div>
  )
}
