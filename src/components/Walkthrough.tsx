import { useState, type ReactNode } from 'react'
import { PeakMark, PeakWordmark } from './PeakWordmark'
import Mascot from './Mascot'
import BetIcon from './BetIcon'
import { navigate } from '../App'

interface Slide {
  kicker: string
  title: string
  body: string
  visual: ReactNode
}

const cardShell = 'flex h-52 w-full items-center justify-center overflow-hidden rounded-3xl border border-line bg-ink-2 px-6'

const SLIDES: Slide[] = [
  {
    kicker: 'Welcome',
    title: 'Hear me out — this is Peak',
    body: "Peak is where good taste has a track record. People post the spots, songs and things they'd actually send a friend — and everyone scores them. No likes. Just calls.",
    visual: (
      <div className={cardShell}>
        <div className="flex items-center gap-4">
          <Mascot mood="happy" className="pop-in h-24 w-24 -rotate-6" />
          <PeakWordmark className="h-12 w-auto text-sig" />
        </div>
      </div>
    ),
  },
  {
    kicker: 'The feed',
    title: 'These are put-ons',
    body: "Every post is a recommendation. The number under the poster's picture is their own call — their score out of 10, on the record before anyone else weighs in.",
    visual: (
      <div className={cardShell}>
        <div className="w-full max-w-[240px] rounded-2xl border border-line bg-ink p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex flex-col items-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sig font-black text-ink">L</span>
              <span className="mt-0.5 text-sm font-black text-sig">10</span>
            </div>
            <div className="min-w-0 pt-1">
              <div className="truncate font-display text-base font-bold">Caracas bakery</div>
              <div className="text-[11px] text-mute">@lucia · Food & Drink</div>
            </div>
          </div>
          <div className="mt-2.5 flex h-16 items-center justify-center rounded-xl bg-gradient-to-br from-sig/30 to-lilac/30">
            <PeakMark className="h-8 w-auto text-fog/70" />
          </div>
        </div>
      </div>
    ),
  },
  {
    kicker: 'Rating',
    title: 'Rate it — your way',
    body: "The crowd's average stays hidden until you rate, so your call is really yours. Press and hold a photo, drag the mountain up: 0 to 10, decimals count. A 10.0 is a Peak. You get one change per post — then it locks.",
    visual: (
      <div className={cardShell}>
        <div className="relative flex h-32 w-32 items-end justify-center overflow-hidden rounded-3xl border border-line bg-ink">
          <div className="absolute inset-x-0 bottom-0 bg-sig/25" style={{ height: '78%' }} />
          <PeakMark className="relative mb-4 h-16 w-auto text-sig" />
          <span className="absolute right-2 top-2 rounded-full bg-sig px-2 py-0.5 text-[10px] font-black text-ink">10.0 = a Peak</span>
        </div>
      </div>
    ),
  },
  {
    kicker: 'Try + Lists',
    title: 'Save it with Try',
    body: 'Tap the flag to Try a spot later — it lands in your Try list for when you actually go. Stack your Tries and drops into ranked Lists, post them when they\'re ready, and Try everything on someone else\'s list in one tap.',
    visual: (
      <div className={cardShell}>
        <div className="flex items-center gap-5">
          <BetIcon saved className="h-20 w-20 text-butter" />
          <div className="space-y-2">
            <span className="block rounded-full bg-butter px-3 py-1 text-xs font-black text-ink">In your Try list</span>
            <span className="block rounded-full border border-line px-3 py-1 text-center text-xs font-black text-mute">Lists · ranked by you</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    kicker: 'Requests',
    title: 'Ask: put me on',
    body: "Don't know where to go? Post an ask — and people answer with real drops, not opinions in a group chat. You get a notification the moment someone puts you on.",
    visual: (
      <div className={cardShell}>
        <div className="w-full max-w-[260px] space-y-2">
          <div className="rounded-2xl rounded-bl-md bg-ink-3 px-4 py-3 text-sm font-bold">
            Put me on: best late-night tacos near Brickell
          </div>
          <div className="ml-8 rounded-2xl rounded-br-md bg-sig px-4 py-3 text-sm font-bold text-ink">
            Answered with a drop — go rate it
          </div>
        </div>
      </div>
    ),
  },
  {
    kicker: 'Your record',
    title: 'Your taste, on the record',
    body: 'Your profile keeps score: Taste is how good your ratings are, Trust is how your calls hold up against the crowd. Together they make your OVR. Call well and the number climbs.',
    visual: (
      <div className={cardShell}>
        <div className="flex items-center gap-4">
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-sig font-display text-lg font-black">
            OVR
          </span>
          <div className="space-y-1.5 text-sm font-black">
            <div>Taste <span className="text-sig">· how good</span></div>
            <div>Trust <span className="text-sig">· how true</span></div>
          </div>
        </div>
      </div>
    ),
  },
]

/**
 * The first-run walkthrough: six slides over the whole loop (put-ons,
 * blind rating, Try, Lists, requests, your record). Shown once per
 * account per device after onboarding; replayable from Settings.
 */
export default function Walkthrough({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === SLIDES.length - 1
  const slide = SLIDES[step]

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/95 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Welcome to Peak — a quick tour">
      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-mute">
            {slide.kicker} · {step + 1} of {SLIDES.length}
          </span>
          {!last && (
            <button onClick={onDone} className="press text-xs font-black text-mute transition hover:text-fog">
              Skip
            </button>
          )}
        </div>

        <div key={step} className="animate-[pop-in_.25s_ease-out]">
          {slide.visual}
          <h2 className="mt-5 font-display text-[26px] font-black leading-tight">{slide.title}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-mute">{slide.body}</p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5">
          {SLIDES.map((s, i) => (
            <span
              key={s.kicker}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-sig' : 'w-1.5 bg-line'}`}
            />
          ))}
        </div>

        {!last ? (
          <div className="mt-5 flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="press rounded-full border border-line px-5 py-3 text-sm font-bold text-mute"
              >
                Back
              </button>
            )}
            <button onClick={() => setStep(step + 1)} className="btn-pop press flex-1 rounded-full py-3 text-sm">
              Next
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            <button
              onClick={() => {
                onDone()
                navigate('/create')
              }}
              className="btn-pop press w-full rounded-full py-3 text-sm"
            >
              Post your first drop
            </button>
            <button
              onClick={onDone}
              className="press w-full rounded-full border border-line py-3 text-sm font-bold text-fog"
            >
              Start exploring
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
