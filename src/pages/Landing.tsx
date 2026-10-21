import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import Reveal from '../components/Reveal'
import TallyMarks from '../components/TallyMarks'
import AlertIcon from '../components/AlertIcon'
import TallyIcon from '../components/TallyIcon'
import Mascot from '../components/Mascot'
import { PinIcon, ChartIcon, VideoIcon, CardsIcon, ChainIcon, SearchIcon, ScoreIcon, SparkIcon } from '../components/icons'
import { tasteScoreFor } from '../lib/stats'

const PHRASES = ['Hear me out', 'Let me put you on', 'Trust me on this one', "Don't sleep on this"]
const SEPARATOR_COLORS = ['text-sig', 'text-lilac', 'text-butter', 'text-sky']

export default function Landing({ mode }: { mode: 'landing' | 'auth' }) {
  if (mode === 'auth') {
    return (
      <div className="mx-auto max-w-lg px-6 pb-16 pt-10">
        <button onClick={() => navigate('/')} className="wordmark mb-8 text-4xl">
          TALLY<span className="text-sig">.</span>
        </button>
        <AuthForm />
        <button onClick={() => navigate('/')} className="mt-8 w-full text-center text-xs text-mute hover:text-fog">
          ← back
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-x-clip">
      {/* top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="wordmark text-3xl">
          TALLY<span className="text-sig">.</span>
        </div>
        <button
          onClick={() => navigate('/auth')}
          className="press rounded-full border-2 border-line px-5 py-2 text-sm font-black text-fog transition hover:border-sig hover:text-sig"
        >
          Log in
        </button>
      </header>

      {/* hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 md:pt-16">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(600px 300px at 20% 10%, rgba(69, 200, 255, 0.10), transparent 60%), radial-gradient(500px 260px at 85% 30%, rgba(185,163,255,0.08), transparent 60%)',
          }}
        />
        {/* sticker decorations */}
        <SparkIcon className="wiggle pointer-events-none absolute left-[8%] top-24 h-8 w-8 text-butter" />
        <SparkIcon className="wiggle-slow pointer-events-none absolute right-[12%] top-40 h-6 w-6 text-sky" />
        <span className="doodle pointer-events-none absolute right-[6%] top-24 hidden rotate-6 text-2xl text-lilac md:block">
          100% real humans ↓
        </span>
        <Reveal>
          <p className="mb-4 inline-block -rotate-2 rounded-full bg-sig px-4 py-1 text-xs font-black uppercase tracking-[0.25em] text-[var(--color-sig-ink)]">
            The taste network
          </p>
          <h1 className="wordmark max-w-3xl text-6xl leading-[0.95] md:text-8xl">
            Good taste deserves a <span className="text-sig">track&nbsp;record.</span>
          </h1>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-mute">
            Drop the places, movies, and music you love. Your friends try them, call{' '}
            <b className="text-win">W</b> or <b className="text-miss">L</b> — and your win rate becomes your
            reputation.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#get-started" className="btn-pop press px-8 py-3.5 text-base">
              Start putting on
            </a>
            <a
              href="#how"
              className="press rounded-full border-2 border-line px-8 py-3.5 text-base font-black text-fog transition hover:border-sig hover:text-sig"
            >
              See how it works
            </a>
            <Mascot mood="happy" className="pop-in hidden h-16 w-16 -rotate-6 sm:block" />
          </div>
        </Reveal>

        {/* interactive demo */}
        <Reveal delay={260} className="mt-14 flex justify-center">
          <div className="w-full max-w-md">
            <p className="mb-3 text-center text-xs font-black uppercase tracking-[0.25em] text-mute">
              Try it — tap W or L
            </p>
            <DemoCard />
          </div>
        </Reveal>
      </section>

      {/* marquee */}
      <div className="overflow-hidden border-y-2 border-line bg-ink-2 py-4">
        <div className="animate-marquee flex w-max gap-8 whitespace-nowrap">
          {[...PHRASES, ...PHRASES, ...PHRASES, ...PHRASES].map((p, i) => (
            <span key={i} className="flex items-center gap-8 text-lg font-black tracking-tight text-fog/80">
              “{p}” <SparkIcon className={`h-5 w-5 ${SEPARATOR_COLORS[i % SEPARATOR_COLORS.length]}`} />
            </span>
          ))}
        </div>
      </div>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <Reveal>
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Put-ons, <span className="text-sig">on the record.</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              Icon: PinIcon,
              title: 'Drop it',
              body: 'Put people onto a spot, a film, a record. Score it 1–10 — your call, on the record.',
              accent: 'bg-sig',
            },
            {
              Icon: ({ className }: { className?: string }) => <TallyIcon saved className={className} />,
              title: 'They try it',
              body: 'Friends tally your drop, go try it for real, and vote.',
              accent: 'bg-lilac',
            },
            {
              Icon: ChartIcon,
              title: 'You get the record',
              body: 'Every W and L feeds your public Taste Score. Missing verdicts never count as wins.',
              accent: 'bg-butter',
            },
          ].map(({ Icon, title, body, accent }, i) => (
            <Reveal key={title} delay={i * 100}>
              <div className="sticker-sm h-full rounded-3xl bg-ink-2 p-6">
                <div className={`mb-4 inline-flex rounded-2xl ${accent} p-2.5 text-[#191725]`}>
                  <Icon className="h-9 w-9" />
                </div>
                <h3 className="wordmark mb-2 text-2xl">{title}</h3>
                <p className="leading-relaxed text-mute">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* the record */}
      <section className="border-y border-line bg-ink-2">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <p className="mb-4 text-xs font-black uppercase tracking-[0.3em] text-sig">The record</p>
            <h2 className="max-w-2xl font-display text-4xl font-bold tracking-tight md:text-5xl">
              Your taste, <span className="text-sig">quantified.</span>
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-mute">
              No star inflation. No fake reviews. Just every put-on you ever made, judged by the people who actually
              tried them — tallied up where everyone can see it.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="sticker mt-8 max-w-xl rounded-3xl bg-ink p-6">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm font-black uppercase tracking-widest text-mute">@you · taste score</span>
                <span className="wordmark text-5xl text-sig">81</span>
              </div>
              <TallyMarks wins={11} losses={1} />
              <p className="mt-3 text-xs text-mute">11 W · 1 L across 12 verdicts — saves don't count as visits.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Built for <span className="text-sig">putting on.</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              Icon: VideoIcon,
              title: '60-second reviews',
              body: 'Real reviews need more than a clip. Shoot up to a minute, right in the app.',
              accent: 'text-sig',
            },
            {
              Icon: CardsIcon,
              title: 'Taste cards',
              body: 'Turn any drop into a story-sized card and put your whole following on.',
              accent: 'text-lilac',
            },
            {
              Icon: ChainIcon,
              title: 'Put-on chains',
              body: 'See who tallied what from whom. Taste travels — now you can watch it.',
              accent: 'text-sky',
            },
            {
              Icon: AlertIcon,
              title: 'Alerts',
              body: 'Know the second someone calls W on your drop.',
              accent: 'text-butter',
            },
            {
              Icon: SearchIcon,
              title: 'Search',
              body: 'Find people with proven taste and drops worth trying.',
              accent: 'text-win',
            },
            {
              Icon: ScoreIcon,
              title: 'Your call, 1–10',
              body: 'Score every drop. The crowd decides W or L.',
              accent: 'text-miss',
            },
          ].map(({ Icon, title, body, accent }, i) => (
            <Reveal key={title} delay={(i % 3) * 100}>
              <div className="h-full rounded-3xl border-2 border-line bg-ink-2 p-6 transition hover:-translate-y-1 hover:border-sig/60">
                <div className={`mb-3 ${accent}`}>
                  <Icon className="h-9 w-9" />
                </div>
                <h3 className="wordmark mb-1.5 text-xl">{title}</h3>
                <p className="text-sm leading-relaxed text-mute">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section id="get-started" className="relative scroll-mt-20 overflow-clip border-t-2 border-line bg-ink-2">
        <SparkIcon className="wiggle pointer-events-none absolute left-[10%] top-10 h-7 w-7 text-lilac" />
        <SparkIcon className="wiggle-slow pointer-events-none absolute bottom-16 right-[8%] h-9 w-9 text-butter" />
        <div className="mx-auto max-w-lg px-5 py-20">
          <Reveal>
            <div className="mb-4 flex justify-center">
              <Mascot mood="star" className="pop-in h-20 w-20" />
            </div>
            <h2 className="wordmark text-center text-4xl md:text-5xl">
              Put someone <span className="text-sig">on.</span>
            </h2>
            <p className="mb-8 mt-3 text-center text-mute">
              Free forever. No fake activity — the club starts with real people, starting with you.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <AuthForm />
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-line px-5 py-8 text-center text-xs text-mute">
        <div className="wordmark mb-2 text-xl text-fog">
          TALLY<span className="text-sig">.</span>
        </div>
        Good taste deserves a track record. © 2026
      </footer>
    </div>
  )
}

/** The mechanic you can feel: a mock drop with working W/L votes. */
function DemoCard() {
  const [wins, setWins] = useState(128)
  const [losses, setLosses] = useState(12)
  const [mine, setMine] = useState<'W' | 'L' | null>(null)
  const [slam, setSlam] = useState<'W' | 'L' | null>(null)

  const vote = (v: 'W' | 'L') => {
    if (mine === v) return
    if (mine === 'W') setWins((w) => w - 1)
    if (mine === 'L') setLosses((l) => l - 1)
    if (v === 'W') setWins((w) => w + 1)
    else setLosses((l) => l + 1)
    setMine(v)
    setSlam(v)
    setTimeout(() => setSlam(null), 450)
  }

  const score = tasteScoreFor(wins, losses)

  return (
    <div
      className="animate-floaty sticker-sm overflow-hidden rounded-3xl bg-ink-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      style={{ '--float-rot': '-1.5deg' } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sig font-black text-ink">J</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            JAG <span className="font-normal text-mute">@jag · 2h</span>
          </div>
        </div>
        <span className="flex flex-col items-center rounded-xl border border-sig/40 bg-sig/10 px-2.5 py-1">
          <span className="text-lg font-black leading-none text-sig">9</span>
          <span className="text-[9px] font-bold text-mute">/10</span>
        </span>
      </div>
      <div className="px-4 pb-1 pt-2">
        <h3 className="font-display text-lg font-bold">Kush Brickell</h3>
        <p className="text-sm text-fog/90">
          <span className="font-bold text-sig">Hear me out — </span>
          the frita cubana is the best burger in Miami. Fight me.
        </p>
      </div>
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-sig/25 via-ink-2 to-ink-3">
        <TallyIcon saved className="h-24 w-24 text-sig/25" />
        <span className="absolute bottom-2 right-3 text-[10px] font-black uppercase tracking-[0.3em] text-sig/60">
          Miami · Food & Drink
        </span>
      </div>
      <div className="px-4 py-4">
        <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-ink-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-win to-sig transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex gap-3">
          {(['W', 'L'] as const).map((v) => (
            <button
              key={v}
              onClick={() => vote(v)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-lg font-black transition active:scale-95 ${
                mine === v
                  ? v === 'W'
                    ? 'bg-win text-ink'
                    : 'bg-miss text-white'
                  : 'border border-line bg-ink-3 text-fog hover:border-sig/60'
              } ${slam === v ? 'verdict-slam' : ''}`}
            >
              {v}
              <span className="text-sm font-bold tabular-nums opacity-80">{v === 'W' ? wins : losses}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-mute">
          <b className="text-sig">{score}</b> taste score · your vote moves it
        </p>
      </div>
    </div>
  )
}

function AuthForm() {
  const { signIn, signUp, configured } = useAuth()
  const [tab, setTab] = useState<'in' | 'up'>('up')
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

  if (!configured) {
    return (
      <div className="rounded-2xl border border-miss/50 bg-miss/10 p-4 text-sm">
        <b>Heads up:</b> this build isn't connected to Supabase yet — add your <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> and restart.
      </div>
    )
  }

  if (checkEmail) {
    return (
      <div className="sticker-sm rounded-3xl bg-ink-2 p-6 text-center">
        <Mascot mood="happy" className="pop-in mx-auto mb-3 h-20 w-20" />
        <h2 className="wordmark mb-2 text-2xl">Check your inbox</h2>
        <p className="text-sm text-mute">
          We sent a confirmation link to <b className="text-fog">{email}</b>. Tap it, then come back and log in — your
          put-ons await.
        </p>
        <button
          onClick={() => {
            setCheckEmail(false)
            setTab('in')
          }}
          className="btn-pop press mt-4 px-6 py-2.5 text-sm"
        >
          I've confirmed — log me in
        </button>
      </div>
    )
  }

  return (
    <div className="sticker-sm rounded-3xl bg-ink-2 p-6">
      <div className="mb-5 grid grid-cols-2 rounded-full bg-ink-3 p-1">
        {(['in', 'up'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
              setError(null)
            }}
            className={`rounded-full py-2 text-sm font-black transition ${tab === t ? 'bg-sig text-[var(--color-sig-ink)]' : 'text-mute'}`}
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
          className="w-full rounded-2xl border-2 border-line bg-ink-3 px-4 py-3 text-[15px] outline-none placeholder:text-mute/60 focus:border-sig"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (6+ characters)"
          autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
          className="w-full rounded-2xl border-2 border-line bg-ink-3 px-4 py-3 text-[15px] outline-none placeholder:text-mute/60 focus:border-sig"
        />
        {error && <p className="text-sm font-bold text-miss">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="btn-pop press w-full py-3.5 text-base"
        >
          {busy ? 'Cooking something up…' : tab === 'in' ? 'Log in' : 'Let me put you on — sign up'}
        </button>
      </form>
      <p className="doodle mt-4 text-center text-xl text-mute">
        no fake activity here — real people only
      </p>
    </div>
  )
}
