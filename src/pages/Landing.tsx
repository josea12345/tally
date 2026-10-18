import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'

const PHRASES = ['Hear me out', 'Let me put you on', 'Trust me on this one', "Don't sleep on this"]

export default function Landing({ mode }: { mode: 'landing' | 'auth' }) {
  const { signIn, signUp, configured } = useAuth()
  const [tab, setTab] = useState<'in' | 'up'>(mode === 'auth' ? 'in' : 'up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password (6+ characters).')
      return
    }
    setBusy(true)
    try {
      const fn = tab === 'in' ? signIn : signUp
      const { error: err } = await fn(email.trim(), password)
      if (err) {
        setError(err)
      } else if (tab === 'up') {
        setCheckEmail(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 pb-16 pt-10">
      <div className="mb-8 font-display text-4xl font-bold tracking-tight">
        TALLY<span className="text-lime">.</span>
      </div>

      <h1 className="mb-4 font-display text-5xl font-bold leading-[1.02] tracking-tight">
        Good taste deserves a <span className="text-lime">track record.</span>
      </h1>
      <p className="mb-6 text-lg leading-relaxed text-mute">
        Find places worth knowing. Put your friends onto something great. Build a reputation for getting it right.
      </p>

      <div className="mb-8 flex flex-wrap gap-2">
        {PHRASES.map((p) => (
          <span key={p} className="rounded-full border border-line bg-ink-2 px-3 py-1.5 text-xs font-bold text-fog">
            “{p}”
          </span>
        ))}
      </div>

      {!configured && (
        <div className="mb-6 rounded-2xl border border-miss/50 bg-miss/10 p-4 text-sm">
          <b>Heads up:</b> this build isn't connected to Supabase yet — add your{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> and restart.
        </div>
      )}

      {checkEmail ? (
        <div className="rounded-2xl border border-lime/50 bg-ink-2 p-6 text-center">
          <div className="mb-2 text-2xl">✉️</div>
          <h2 className="mb-2 text-xl font-black">Check your inbox</h2>
          <p className="text-sm text-mute">
            We sent a confirmation link to <b className="text-fog">{email}</b>. Tap it, then come back and log in —
            your put-ons await.
          </p>
          <button
            onClick={() => {
              setCheckEmail(false)
              setTab('in')
            }}
            className="mt-4 rounded-full bg-lime px-6 py-2.5 text-sm font-black text-ink"
          >
            I've confirmed — log me in
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-ink-2 p-6">
          <div className="mb-5 grid grid-cols-2 rounded-full bg-ink-3 p-1">
            {(['in', 'up'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  setError(null)
                }}
                className={`rounded-full py-2 text-sm font-black transition ${
                  tab === t ? 'bg-lime text-ink' : 'text-mute'
                }`}
              >
                {t === 'in' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-2xl border border-line bg-ink-3 px-4 py-3 text-[15px] outline-none placeholder:text-mute/60 focus:border-lime"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (6+ characters)"
              autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
              className="w-full rounded-2xl border border-line bg-ink-3 px-4 py-3 text-[15px] outline-none placeholder:text-mute/60 focus:border-lime"
            />
            {error && <p className="text-sm font-bold text-miss">{error}</p>}
            <button
              type="submit"
              disabled={busy || !configured}
              className="w-full rounded-full bg-lime py-3.5 text-base font-black text-ink transition hover:bg-lime-dim disabled:opacity-50"
            >
              {busy ? 'One sec…' : tab === 'in' ? 'Log in' : 'Let me put you on — sign up'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-mute">
            No fake activity here — the community starts with real people, starting with you.
          </p>
        </div>
      )}

      <div className="mt-10 grid grid-cols-3 gap-3 text-center">
        {[
          ['Drop', 'Put people onto places, movies, music you love'],
          ['Visit', 'Save drops, try them, call W or L'],
          ['Prove it', 'Your win rate is your reputation'],
        ].map(([t, b]) => (
          <div key={t} className="rounded-2xl border border-line bg-ink-2 p-4">
            <div className="mb-1 text-base font-black text-lime">{t}</div>
            <div className="text-[11px] leading-snug text-mute">{b}</div>
          </div>
        ))}
      </div>

      <button onClick={() => navigate('/')} className="mt-8 w-full text-center text-xs text-mute hover:text-fog">
        ← back
      </button>
    </div>
  )
}
