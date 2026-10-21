# TALLY — redesign brief for Lovable

## What this is

TALLY is a live social web app where people prove they have great taste.
Users publish recommendations ("drops") — places, food & drink, movies,
TV, music, shops, recipes — other users save ("tally") them, try them,
and vote W or L. Your reputation is a transparent track record: win rate
and a Taste Score computed from real verdicts only.

- Live app: https://tally-rho-ten.vercel.app
- Repo: github.com/josea12345/tally (import this repo, or use the ZIP)
- Stack: Vite + React + TypeScript + Tailwind CSS v4, hash routing
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions) — LIVE,
  with real users and real data.

## Your mission

Redesign the **look, feel, and UX** of: the landing page, onboarding,
the feed ("Put Ons"), drop cards, profiles, search, posting (composer +
camera + video editor), notifications, and settings.

Target feel: a modern social app — think X / Instagram / TikTok.
Full-bleed media, fast, thumb-first, iPhone-sized screens first.
It should feel like a native app, not a website.

## HARD CONSTRAINTS — do not break these

1. **Keep the backend exactly as-is.** Same Supabase project, same
   tables/columns, same auth, same storage buckets (`drop-media`,
   `avatars`), same edge functions (`music-search`, `push-on-notify`,
   `delete-account`), same Vercel serverless functions in `api/`.
   Do NOT create a new Supabase project, do NOT redesign the schema,
   do NOT change any Supabase query's tables, columns, or semantics.
   The SQL in `supabase/migrations/` is already applied to production —
   never edit or re-run it.
2. **Keep every route working.** Hash routes live in
   `src/lib/routes.ts`: home, auth, onboarding, drop/:id, create,
   edit/:id, filter, video, camera, saved, profile(/:username),
   followers/:id, following/:id, search, notifications, settings,
   topic/:name, leaderboard, list/:id. Public share URLs
   (/drop/:id, /list/:id, /u/:id) are answered by `api/*.js` — keep them.
3. **Keep the data logic.** Taste Score = Wilson lower bound of the
   W/L record (`src/lib/stats.ts`). Win rate shows "Not enough data
   yet" below 5 verdicts. **Never add fake users, fake drops, fake
   counts, or placeholder activity — the database is real and honest.**
4. **Environment variables** (set them in the project settings; values
   come from the existing deployment — ask the owner, never hardcode):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TMDB_API_KEY`,
   `VITE_OMDB_API_KEY`, `VITE_VAPID_PUBLIC_KEY`. See `.env.example`.
   The app intentionally shows a configuration-error screen if the
   Supabase vars are missing — keep that behavior.
5. **The build and tests must pass when you finish:**
   `npm run check` (typecheck + unit tests + production build) and
   `npm run build`. There are 28 unit tests in `src/lib/*.test.ts` —
   keep them green; the strict TypeScript check is currently at
   **zero errors** — keep it there.

## Product & design rules

- Brand color: hot light blue **#45C8FF** (CSS token `--color-sig`).
  Butter yellow is the secondary accent. Signature mascot "Blip".
- Feed name is **"Put Ons"**. Brand voice: "hear me out",
  "let me put you on". Landing headline: "Good taste deserves a
  track record."
- **No generic stock emojis in the UI.** The app uses its own
  tally-stroke iconography (see `src/components/icons.tsx` and
  `TallyIcon`) — keep that language or extend it in the same style.
- The **central create/camera button** in the bottom nav must stay
  prominent (raised, glowing) — it's the hero action.
- Posting rules: video max **60 seconds**; photos/carousels up to 10;
  the author's own 1–10 score on a new drop is **required**.
- Soundtracks: songs attach from Deezer search (30s previews, via the
  `music-search` edge function) and play in sync with the video. In the
  editor users choose **Original / Both / Song only** — keep that.
- Light + dark themes exist (CSS tokens in `src/index.css`,
  `src/lib/theme.ts`). The camera stays dark. Keep both working.
- Keep it free-tier: no new paid APIs or services.

## How to work

- Make changes in the real files of this project — this is the
  production codebase, not a mockup.
- After each surface, sanity-check it at an iPhone viewport
  (~390×844) and confirm `npm run build` still passes.
- When in doubt about behavior, the current code is the spec —
  redesign the presentation, preserve the behavior.
