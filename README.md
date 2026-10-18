# TALLY — Good taste deserves a track record.

A mobile-first social web app where people build a reputation for having great taste.
Users publish "drops" (place / movie / TV / music recommendations), others save them,
try them, and call **W** or **L**. Win rate is the reputation — transparent,
earned, never faked.

**Stack:** Vite + React + TypeScript + Tailwind CSS v4 + Supabase (Auth, Postgres + RLS, Storage).
**Cost:** $0 — Supabase free tier, Vercel free tier, no paid APIs (Photon + ArcGIS for
place search, Google Fonts for Inter).

## 1. Supabase setup (do this first)

1. Create a free project at [supabase.com](https://supabase.com) (or use the existing one).
2. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/0001_tally_init.sql`](supabase/migrations/0001_tally_init.sql),
   and run it. This creates:
   - tables: `profiles`, `drops`, `saves`, `verdicts`, `follows` (UUID PKs, timestamps, FKs, unique constraints, indexes)
   - Row Level Security on every table (public reads; users manage only their own rows — enforced in the DB, not just the UI)
   - an `auth.users` trigger that auto-creates a `profiles` row on signup
   - the public `drop-media` storage bucket (authenticated writes only to `<user_id>/*`)
3. In **Project Settings → API**, copy the **Project URL** and the **publishable / anon key**.
4. In **Authentication → URL Configuration**, add your site URL (e.g. your Vercel URL)
   to Site URL and Redirect URLs so email confirmation links land back in the app.

## 2. Run locally

```bash
cp .env.example .env
# edit .env: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev      # → http://localhost:5173
```

The app warns in the UI if the env vars are missing. `.env` is gitignored — keys never get committed.

## 3. Build

```bash
npm run build    # type-checks (tsc --noEmit) then vite build → dist/
```

## 4. Deploy (Vercel via GitHub)

1. Push this repo to GitHub (or run `gh repo create tally --public --source=. --push`).
2. In Vercel: **Add New → Project → Import** the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output `dist/` (already in `vercel.json`).
4. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Deploy. Every drop gets a public link at `yourapp.vercel.app/#/drop/<id>`.

## Features

- Email/password auth + short onboarding (unique username with live availability check, display name, bio, avatar, city)
- Discover with **Put Ons / Following / Near me** tabs, category filters, server-side search, tastemaker rail
- Drop composer: category chips, place autocomplete (Photon + ArcGIS, category-filtered, GPS-biased via "Locate me"), photo/short-video upload to Supabase Storage, per-category link chips (IMDb / Rotten Tomatoes / Spotify / Official site + auto Google Maps link)
- Saves, tried-gate, one-changeable W/L verdict per user per drop, animated poll bar, "Called it" payoff
- Put-on chains (provenance thread), shareable taste-card PNGs (1080×1920), public drop pages with join banners
- Profiles: follower/following counts, drops / saved-by-others / verdicts-received / win rate ("Not enough data yet" under 5 verdicts), earned badges (W streaks, neighborhood oracle, first-to-drop-it, crowd favorite)
- People page: people search, who-to-follow (ranked by proven taste), taste twins, weekly city leaderboard
- PWA: manifest, icons, install banner; mobile bottom nav + desktop 3-column layout
- Voice throughout: "hear me out", "let me put you on", "don't sleep on this"

## Notes

- The database starts empty — the app never fabricates users, reviews, or activity.
- Location: GPS via the Geolocation API when the user taps "Locate me" (cached); profile city is the fallback. Every off-state (blocked, denied, timeout) is explained in the UI with a retry path.
- Media uploads: images/video validated client-side (20 MB max), stored at `<user_id>/<uuid>.<ext>`.
