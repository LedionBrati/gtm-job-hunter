# Current status — read this before starting work

Last updated: 2026-07-29. Build plan is in `PLAN.md` (6 parts, one at a time).

## Where we are

| Part | State |
|---|---|
| 0 — Setup | Done. Vercel project `santorini-tech-solutions/gtm-job-hunter`, env vars set in Production. |
| 1 — Schema | Done. 3 migrations in `supabase/migrations/`. |
| 2 — YC importer | Done. **531 companies, 1063 contacts.** |
| 3 — Presence checker | Done, but enrichment is **incomplete** — see Apify below. |
| 4 — Dashboard | Done and deployed: https://gtm-job-hunter.vercel.app (password-gated). |
| 5 — AI outreach drafts | **Not started. This is next.** |
| 6 — Pipeline tracking | Not started. |

## Do this next: Part 5 (AI outreach drafts)

Per `PLAN.md` Part 5: a "Draft message" button on the company detail page that
calls the Claude API (`claude-sonnet-5`) with the company data, the stored score
evidence, the founder's name, and Ledi's background; saves the result to
`outreach.message_text`, sets `stage` to `drafted`. **The tool must never send
anything** — Ledi sends every message by hand.

Useful groundwork already in place:
- `lib/queries.ts` `getCompany(id)` returns the company with `socials`,
  `contacts`, `outreach`, and the latest `score` (including `reasons`, the
  evidence array the prompt should quote from).
- Evidence strings are already written in human prose with proper platform
  names ("No X account found"), specifically so they can go straight into a
  prompt. Don't re-derive them.
- `app/actions.ts` shows the Server Action pattern used here.
- There is **no `ANTHROPIC_API_KEY` in `.env.local` yet** — Ledi needs to add it,
  and to `vercel env` for Production.

## Non-obvious things that will bite you

**This Next.js is 16.2.10 — read `node_modules/next/dist/docs/` first.**
`AGENTS.md` says this and it matters:
- `params` and `searchParams` are **async** — must be awaited. Sync access is
  fully removed in 16.
- Middleware is renamed **`proxy.ts`** (project root). Ours does the auth gate.
- Turbopack is the default for `dev` and `build`.
- Only one `next dev` per directory; it refuses a second and picks a free port
  (3000 is usually occupied on this machine, so it lands on **3001**).

**`~` is itself a git repo** (Ledi's CV site). This project is a *nested* repo.
Always run git with `-C` on the project path, and never run destructive git
commands from `~`.

**`scores` is insert-only.** Every `npm run score:companies` run appends a fresh
row per company. `lib/queries.ts` deliberately picks the **newest by
`scored_at`** — never assume one row per company. If you want one row per
company you must clear the table first (needs Ledi's approval; a blanket DELETE
is blocked by the safety classifier by default).

**PostgREST silently caps unbounded selects at 1000 rows.** An early diagnostic
undercounted LinkedIn rows because of this and sent us chasing a phantom bug.
Always pass an explicit `.limit()`.

**Scoring weights are a deliberate judgement call, not a bug.**
`presence_gap 0.6 / fit 0.4`, hardcoded in `scripts/score-companies.ts` with a
long comment. A previous version derived them via PCA; that produced a
**negative** fit weight (the two scores are mildly negatively correlated,
r ≈ -0.13) and ranked the best targets last. Don't reintroduce PCA — with only
two standardized inputs it is always exactly 50/50 and cannot express a
preference. See commit `71d1bb3`.

**The dashboard is gated by HTTP Basic auth** (`proxy.ts`, `DASHBOARD_PASSWORD`
in `.env.local` and Vercel Production). It **fails closed** — no password
configured returns 503, never open access. Necessary because the app runs on the
Supabase **service-role key** (RLS bypassed) and holds 1063 real founders' names
and emails, and Server Actions are POST endpoints reachable directly.
⚠️ Chrome shows Basic auth as a **native dialog that blocks all browser
automation**. To screenshot, navigate with credentials embedded in the URL
(`http://x:<password>@localhost:3001/`) or the session will freeze.

## Known gaps, accepted by Ledi

- **Apify free tier is exhausted** ($5.02 of $5) and does not reset until
  **2026-08-20**. So **~93 LinkedIn rows are unenriched** and sit at the
  `gap = 0.6` placeholder in scoring; 421 of 532 (79%) have real follower data.
  Instagram and X were never enrichable (paid actors). **After Aug 20, re-run
  `npm run enrich:socials` then `npm run score:companies`** to sharpen the
  ranking. Current top-of-list ranks mostly on *confirmed absences*, which is
  still strong pitch material.
- **~8 companies** have a LinkedIn URL that is a bare numeric admin ID with no
  recoverable public slug (`/company/109636610/` → login wall). Not fixable from
  the stored URL; would need a fresh lookup. Ledi decided it's not worth it.
- **1 duplicate `socials` row** (two empty `not_found` LinkedIn rows for one
  company, from Jul 22). Harmless — scoring reads the first match per platform.
- **The dashboard has never been visually reviewed.** The Chrome extension could
  not pair (it is installed only in Chrome's `Default` profile, whose claude.ai
  login is `lediobrati@gmail.com`, while Claude Code was authenticated as
  `ledion.brati@theagi.company`). Everything was verified via rendered HTML,
  `tsc`, `eslint`, and `next build` — **not pixels.** Open questions for Ledi's
  eye: row density, the ghost-numeral thresholds (solid amber ≥80, plain 65–79,
  outlined <80), whether the "perforated" absence effect actually reads, and
  whether the `GAPS` ghost word is too subtle.

## Design system — match it, don't invent

The dashboard deliberately imitates Ledi's personal site, **`~/index.html`**
(single hand-written file, deployed from the `~` repo). Read it before changing
any styling. Tokens live in `app/globals.css`:

- `--bg #0a0a0a`, cards `#111` / hover `#161616`, `--text #f0ece4` (warm
  off-white, *not* pure white), dim `#999`, muted `#555`, border `#1c1c1c`
- One accent: amber `--accent #e8a020`, wash `rgba(232,160,32,0.12)`
- **Syne** (700/800) for display and names; **Space Mono** for everything else,
  including headlines — mono uppercase with `-0.03em` tracking is the site's
  signature inversion. Never Inter/Roboto/system fonts.
- Tiny labels: 0.62rem, 0.2–0.3em tracking, uppercase, amber
- Devices carried over: fractal-noise overlay at 0.025 opacity; outlined
  transparent "ghost" text (`-webkit-text-stroke`); hairline rules; amber
  underline growing 0→100% on hover; `gap: 1px` over a border-coloured
  background to make hairline grids.

The core visual idea: **the ghost-outline device encodes data, not decoration.**
A missing account is a hollow ring barely above the background so a high-gap
company reads as perforated; the score numeral is outlined when weak and solid
amber when strong. Preserve that if you touch `components/presence-strip.tsx`
or `components/score-mark.tsx`.

Ledi's global instructions (`~/.claude/CLAUDE.md`) have firm frontend rules —
distinctive fonts, committed aesthetic, purposeful motion. Follow them.

## Commands

```bash
npm run dev                # localhost:3001 (3000 usually busy)
npm run build              # Turbopack; also typechecks
npx eslint app lib components scripts proxy.ts
npm run import:yc          # Part 2 importer (idempotent via companies.yc_slug)
npm run discover:socials   # finds handles; SKIPS platforms already having a row
npm run enrich:socials     # Apify; TEST_LIMIT=3 to sample. BLOCKED until Aug 20
npm run score:companies    # free, no API calls; appends new score rows
npx vercel --prod --yes    # deploy
```

`TEST_LIMIT=n` on the discover/enrich scripts caps how many rows they touch —
always sample before spending Apify credit.

## Gotcha that cost time once

A transient `JWT issued at future` error from Supabase on the first request was
**clock skew on this machine**, not a code bug. Subsequent requests return 200.
If you see it, don't debug the query.
