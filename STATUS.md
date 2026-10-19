# Current status — read this before starting work

Last updated: 2026-08-23. Build plan is in `PLAN.md` (6 parts, one at a time).

## The Supabase pause, and how to recognise it again

On 2026-08-23 `<project-ref>.supabase.co` briefly returned **NXDOMAIN**
from 8.8.8.8 and 1.1.1.1 alike, and every page 500'd with
`Failed to load companies: TypeError: fetch failed`. Ledi unpaused it the same
day and the data came back intact.

Supabase pulls DNS for free-tier projects it pauses after a stretch of
inactivity, so this will recur whenever the project sits idle. **A `fetch
failed` from `lib/queries.ts` is almost always this, not a bug** — check
`nslookup <project-ref>.supabase.co` before debugging any query.

## Where we are

| Part | State |
|---|---|
| 0 — Setup | Done. Vercel project `santorini-tech-solutions/gtm-job-hunter`, env vars set in Production. |
| 1 — Schema | Done. 3 migrations in `supabase/migrations/`. |
| 2 — YC importer | Done. **531 companies, 1063 contacts.** |
| 3 — Presence checker | Done. LinkedIn 85% measured; the rest is permanently unmeasurable — see Known gaps. |
| 4 — Dashboard | Done and deployed: https://gtm-job-hunter.vercel.app (password-gated). |
| 5 — AI outreach drafts | Done and verified against the live API. Uses **OpenAI**, not Claude. |
| 6 — Pipeline tracking | Done. Stage dropdown, +4-day follow-ups, due view, stats band. |

## Part 5 (AI outreach drafts) — working

Built 2026-08-23. `npm run build`, `tsc` and `eslint` are clean.

**Verified against real data:** `npm run preview:prompt` renders the exact
prompt for a real company without spending an API call. On Lucid (W25, 3 people,
hiring) → its founder it picked the LinkedIn channel correctly (no email on file),
quoted the four stored evidence lines verbatim including the honest "found but
not yet enriched" case, and — with `SF_WINDOW` empty — suppressed the geography
claim and asked for a 15-minute call instead. The page also renders the panel
correctly against live data, with the founder select populated.

**Not verified: the button.** No draft has ever been generated, because there is
still no `ANTHROPIC_API_KEY`. The click path (Server Action round-trip → API →
save → re-render) is unproven. Ledi should click it once with a key in place
before trusting it.

⚠️ **Don't screenshot this app through a hand-rolled HTTP proxy.** Chrome's
automation refuses `user:pass@host` URLs, and the obvious workaround — a small
Node proxy that injects the Basic auth header — silently breaks React
hydration: pages paint from SSR HTML and look perfect while nothing on them is
interactive, with no console error. A forwarded `transfer-encoding` header
corrupts the streamed RSC payload. Verified this by checking that the
pre-existing `/companies/new` form also had zero React fibers through the proxy.
If you need real interaction, type the password into the browser by hand.

What it does: a "Draft message" panel on the company detail page picks a founder,
calls Claude with the company facts and the stored score evidence, saves the
result to `outreach.message_text`, and sets `stage` to `drafted`. Ledi edits it
in place, saves, copies, and sends it himself. **Nothing is ever sent from the
app**, and there is no code path that could send one.

Files: `lib/outreach-prompt.ts` (prompt construction, pure), `lib/anthropic.ts`
(the API call), `draftMessage` / `saveDraft` in `app/actions.ts`,
`components/outreach-panel.tsx`, and `.field-prose` in `globals.css`.

Two things must be set before it produces anything sendable:

1. **`ANTHROPIC_API_KEY`** in `.env.local`, and `vercel env add` for Production.
   Without it the button returns a clear error rather than failing silently.
2. **`SF_WINDOW` in `lib/outreach-prompt.ts`** is deliberately empty. Set to a
   non-empty string, the drafts tell founders Ledi is in San Francisco during
   that window — a factual claim in a real message, so a stale value is a lie to
   a stranger. Left empty, the prompt drops the geography claim entirely and
   asks for a 15-minute call instead. The YC SUS trip (Jul 15–30 2026) is over;
   this needs Ledi's next actual dates or it stays empty.

Deviation from `PLAN.md`: the model is **`claude-opus-5`**, not the
`claude-sonnet-5` the plan named. A draft is ~1k tokens in and ~200 out, so the
cost difference is fractions of a cent per message, and the output quality is
the entire product. One constant at the top of `lib/anthropic.ts` changes it.

Groundwork this relied on, worth knowing:
- `lib/queries.ts` `getCompany(id)` returns the company with `socials`,
  `contacts`, `outreach`, and the latest `score` (including `reasons`, the
  evidence array the prompt quotes from).
- Evidence strings are already human prose with proper platform names ("No X
  account found"), so they go straight into the prompt un-rewritten.
- `outreach` has **no unique constraint on `company_id`**, so `upsert()` would
  quietly create a second row per company. `upsertOutreach()` in
  `app/actions.ts` reads first, then updates or inserts. Keep that.

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

## ⚠️ Uncommitted, unapplied: the tenancy migration

`supabase/migrations/20260823173000_add_tenancy_skeleton.sql` exists on disk,
is **not committed and not applied**, and **must not be applied as-is**.

It adds `NOT NULL tenant_id` (no default) to `contacts`, `contact_socials`,
`scores` and `outreach`. No code anywhere sets `tenant_id` — verified by grep.
Applying it therefore breaks every insert in the project the moment it lands:
`score:companies`, `import:yc`, and the outreach save in `app/actions.ts` would
all start failing on a not-null violation.

It is also scope beyond `PLAN.md`'s six parts. If multi-tenancy is genuinely
wanted, it needs its Phase 2 landed in the same change: auth, the RLS policies,
and every insert path updated to supply `tenant_id`. Otherwise delete the file.
Take `npm run backup` first either way.

## Known gaps, accepted by Ledi

- **LinkedIn is 455 of 532 (85%) measured**, and those numbers now actually
  reach the score (see the scoring trap below).
- **Original note:** coverage, up from 421, after the
  enrichment re-run on 2026-08-23 (Apify cycle reset 08-21, spend $0.10 of $5).
  Instagram and X remain permanently unmeasured — their Apify actors need a
  paid plan — so **332 X rows and 117 Instagram rows will never have follower
  data**. Those sit at the `gap = 0.6` placeholder in scoring and are filtered
  out of the outreach prompt (see Part 5).
- **57 LinkedIn rows can never be enriched logged-out.** Their stored URL is a
  bare numeric company id (`/company/102726930`), which LinkedIn only resolves
  for signed-in users; logged out it 302s to the login wall. `enrich-socials.ts`
  now detects these and skips them *before* paying for an actor run.
  ⚠️ An earlier note here said "~8 companies". That was wrong — it had only
  sampled URLs that looked malformed (an `/admin/` tail) and missed clean
  numeric ones. Recovering them needs a fresh Serper lookup keyed on company
  name, verified against the company website (the logic already exists in
  `discover-socials.ts` as `verifyLinkedinMatch`); nobody has built that repair
  pass yet, and `discover:socials` will NOT fix them because it skips any
  platform that already has a row.
- **1 duplicate `socials` row** (two empty `not_found` LinkedIn rows for one
  company, from Jul 22). Harmless — scoring reads the first match per platform.
- **Ledi reviewed the dashboard on 2026-08-01** and the verdict was that it was
  hard to read. A typography pass followed (see Design system above): Archivo
  for prose, mono demoted to structural roles, labels enlarged and de-tracked,
  contrast raised to AA. His remaining open questions below are still open.
- **The original build was never visually reviewed.** The Chrome extension could
  not pair (it is installed only in Chrome's `Default` profile, which was signed
  in to a different claude.ai account than Claude Code). Everything was verified via rendered HTML,
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
- **Syne** (700/800) for display and names; **Space Mono** for headlines,
  labels, chips, buttons, form fields and figures — mono uppercase with
  `-0.03em` tracking is the site's signature inversion, and it is kept.
  **Archivo** (added 2026-08-01) carries body prose. Never Inter/Roboto/system.
- ⚠️ **Do not put mono back on `body`.** Ledi read the deployed dashboard and
  could not follow it: "the letters are very wide." That is monospace doing
  what monospace does — uniform advance widths — over a 531-row list, which the
  one-page personal site never has to survive. Mono is now opted *into* per
  element, never inherited. Keep it that way.
- ⚠️ `.field` puts **mono** on form controls, which is right for URLs, handles
  and slugs and wrong for the outreach draft — that box holds 120 words of
  English. `.field-prose` opts it back to Archivo. Same box, different face.
- Labels: 0.68–0.7rem, 0.08–0.18em tracking, uppercase. The old 0.58rem/0.2em
  was unreadable; wide tracking is for 1–2 word section titles only, never
  sentences.
- Text colours are a 3-step ramp with fixed jobs — `--text` for names,
  `--text-dim #999` (7:1) for prose, `--text-meta #8a8a8a` (5.7:1) for
  metadata, and `--text-muted #555` for **decoration only**. #555 is 2.7:1 on
  `--bg`, under the 4.5:1 floor: it must never carry a word that has to be
  read. It previously held each row's gap summary — the single most important
  sentence on the page.
- Devices carried over: fractal-noise overlay at 0.025 opacity; outlined
  transparent "ghost" text (`-webkit-text-stroke`); hairline rules; amber
  underline growing 0→100% on hover; `gap: 1px` over a border-coloured
  background to make hairline grids.

The core visual idea: **the ghost-outline device encodes data, not decoration.**
A missing account is a hollow ring; the score numeral's weight tracks its value.
Preserve *that idea* in `components/presence-strip.tsx` and
`components/score-mark.tsx` — but note how it is now implemented, and why:

- **Score numerals are solid, never outlined** (changed 2026-08-01). They used
  `color: transparent` + a 1px `#555` stroke below 80. At hero size that device
  is beautiful; at 30px in a list column it renders the digit as a hairline
  sketch thinner than the text around it, so the number you most need to read
  became the least legible mark on the row — Ledi's actual complaint. Now a
  three-step solid ramp: amber ≥80, `#d8d2c6` 65–79, `#6f6a62` below. Same
  hierarchy, all readable. Outline is reserved for the `GAPS` hero word, which
  nobody has to read.
- **Score numerals are Space Mono, not Syne.** Syne extrabold at `-0.04em` set
  "90" tight enough that the glyphs merged; mono also aligns digit-for-digit
  down 531 rows.
- **`--void` is `#6a655c`, not `#2b2b2b`.** The old value was 1.4:1 on `--bg`,
  so "no account found" — the product's entire thesis — rendered as almost
  nothing at 8px. 3.2:1 now, still clearly empty beside a filled amber dot.

**General rule this project learned the hard way:** a device that encodes data
must survive being *read*. If expressing the value costs legibility of the
value, the encoding lost — move the expression to colour, weight or position
and keep the glyph solid.

Ledi's global instructions (`~/.claude/CLAUDE.md`) have firm frontend rules —
distinctive fonts, committed aesthetic, purposeful motion. Follow them.

## Commands

```bash
npm run dev                # localhost:3001 (3000 usually busy)
npm run build              # Turbopack; also typechecks
npx eslint app lib components scripts proxy.ts
npm run import:yc          # Part 2 importer (idempotent via companies.yc_slug)
npm run discover:socials   # finds handles; SKIPS platforms already having a row
npm run enrich:socials     # Apify; TEST_LIMIT=3 to sample. Quota resets ~21st monthly
npm run score:companies    # free, no API calls; appends new score rows
npm run preview:prompt     # free; prints the exact outreach prompt for a company
                           # `-- <company-id>` picks one; default is top-ranked
npx vercel --prod --yes    # deploy
```

`TEST_LIMIT=n` on the discover/enrich scripts caps how many rows they touch —
always sample before spending Apify credit.

**Scoring ignored every follower count it had.** `platformGap()` tested
`status === "found"` before looking at `followers`, returning a flat 0.6
placeholder — and because the LinkedIn actor reports followers but no posting
activity, `enrich-socials.ts` leaves enriched LinkedIn rows at status "found"
forever. So all 455 measured rows scored as if unmeasured. Fixed 2026-08-23 by
branching on `followers === null`. Evidence citing a real follower number went
from 6 companies to 457, and the score range widened from 44-86 to 34-86.
Lesson for anything added here: **status is a workflow flag, not a statement
about what data exists** — test the data.

## Provider: OpenAI, not Claude

Ledi chose OpenAI on 2026-08-23. `lib/openai.ts` is the only file that talks to
the provider; `lib/outreach-prompt.ts` holds all the wording and names no
provider, so switching again means rewriting one file. Env is `OPENAI_API_KEY`
(set in .env.local and Vercel Production), model is `OPENAI_MODEL` defaulting
to `gpt-5.2` — confirmed present on his account via /v1/models, not assumed.

First live draft (Lucid → its founder) came back in 7s at 72 words, quoting the
real 642-follower figure, and passed every prompt constraint: no em-dash, no
emoji, no flattery opener, no subject line, under 120 words.

**Open positioning question, for Ledi not for code:** the prompt feeds the
model both "runs a small AI agency" and "targeting GTM roles", so drafts waver
between selling a service and asking for a job. The first draft did both in one
sentence. Whichever he wants should be made singular in `BACKGROUND` in
lib/outreach-prompt.ts.

## Two traps that already cost real money and time

**A `"use server"` module may only export async functions.** Exporting the
`STAGES` array from `app/actions.ts` typechecked cleanly and then failed
`next build` with "can only export async functions, found object". Types are
fine (erased); runtime values are not. Shared constants live in `lib/stages.ts`
for this reason. Corollary: **`tsc` passing does not mean the app builds** —
run `npm run build` before claiming a change works.

**`.limit(5000)` does NOT defeat PostgREST's row cap.** Supabase enforces a
server-side max-rows of 1000 that a client `.limit()` cannot raise: you get
1000 rows, no error, no truncation warning. `lib/queries.ts` used to do exactly
this while carrying a comment claiming it was safe. It now pages explicitly via
`fetchAllPages()`. Any new query over a table that can exceed 1000 rows
(`socials` is already 1425) must page too.

**The Apify LinkedIn actor does not follow redirects.** LinkedIn 301s an alias
or outdated company slug to its canonical one (`/company/digpangolin` ->
`/company/pangolin-net`); the actor just returns an empty dataset, so the run
is billed and yields nothing. `enrich-socials.ts` resolves the redirect itself
with one free request first. Before this fix a full run produced *zero* usable
rows out of 27 while still spending credit.

## Gotcha that cost time once

A transient `JWT issued at future` error from Supabase on the first request was
**clock skew on this machine**, not a code bug. Subsequent requests return 200.
If you see it, don't debug the query.
