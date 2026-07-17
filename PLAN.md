# GTM Job-Hunt Tool — Build Plan

## Context

I'm Ledi Brati, an economics student at AUEB (Greece), currently in San Francisco
until July 30, 2026 for YC Startup School. I'm targeting GTM / growth / founding
sales roles at early-stage startups.

**The product:** find YC startups (recent batches) that have a weak or nonexistent
social media presence (LinkedIn, X, Instagram, TikTok), and help me cold-outreach
their founders. The detected gap IS the pitch: "You're a YC startup with zero
social presence — I do GTM and growth, let me fix it." The tool finds the wound;
my message offers the cure.

**Principles:**
- I am the only user. This tool is also my portfolio piece for interviews.
- Quality over volume: messages are always human-reviewed and sent by me
  manually. The tool NEVER auto-sends anything.
- Every score must store its evidence/reason so the dashboard can show WHY.

## Stack

- Next.js (App Router, TypeScript, Tailwind) — dashboard + API routes
- Supabase (Postgres) — all data
- Vercel — deployment
- Apify — pay-per-result scrapers for Instagram / TikTok / LinkedIn / X
  (profile stats: followers, last post date)
- Serper.dev — Google search API for discovering social handles
- Claude API — drafting personalized outreach messages (Part 5)

## Working instructions for the coding agent

Work ONE part at a time. After finishing a part, STOP so I can verify the
"Done when" condition before we continue. Do not skip ahead.

---

## Part 0 — Project setup

- Scaffold Next.js in this folder: App Router, TypeScript, Tailwind, ESLint
- Init git repo (this folder only — NOTE: my home directory ~ is itself a git
  repo for my CV site; never run git commands against it)
- Create a Supabase project (I'll do this in the browser if needed); put
  SUPABASE_URL + keys in .env.local; add .env.local to .gitignore
- Install @supabase/supabase-js
- Link to Vercel, add env vars, deploy the empty shell

**Done when:** the deployed Vercel URL loads.

## Part 1 — Database schema

Tables (SQL migration run in Supabase):

- `companies` — id, name, website, yc_batch, one_liner, industry, team_size,
  location, is_hiring (bool), yc_url, created_at
- `socials` — id, company_id, platform (enum: linkedin | x | instagram | tiktok),
  url, followers (int, nullable), last_post_at (date, nullable),
  status (enum: not_found | found | dead | active), checked_at
- `contacts` — id, company_id, name, role, is_founder (bool), linkedin_url
- `scores` — id, company_id, presence_gap_score (int), fit_score (int),
  total_score (int), reasons (jsonb — array of {criterion, points, evidence}),
  scored_at
- `outreach` — id, company_id, contact_id, stage (enum: not_started | drafted |
  sent | replied | meeting | dead), message_text, sent_at, next_followup_at,
  notes

**Done when:** one hand-inserted company flows through all tables without errors.

## Part 2 — YC company importer

- Import companies from the YC startup directory (ycombinator.com/companies)
  into `companies`. Prioritize recent batches (W25, S25, W26) — newest companies
  are least likely to have socials and most likely founder-led.
- Capture: name, website, batch, one-liner, industry, team size, hiring status,
  YC profile URL. Grab founder names into `contacts` where available.
- Build as a script or API route I can re-run for new batches.

**Done when:** a few hundred recent-batch YC companies are in the DB.

## Part 3 — Automated presence checker (the heart of the tool)

For each company, determine per platform (LinkedIn, X, Instagram, TikTok):
does an account exist? followers? last post date?

Pipeline (fully automated, batch-processing all companies):

1. **Discover handles:**
   - Fetch the company website; scan HTML for social links
     (linkedin.com/company/…, x.com/…, instagram.com/…, tiktok.com/@…)
   - If not found on their site, query Serper.dev:
     `"[company name]" site:instagram.com` (etc. per platform)
   - Nothing found anywhere → record status `not_found` (maximum gap signal,
     zero scraping cost)
2. **Enrich found handles via Apify actors** (batched):
   - Instagram + TikTok profile scrapers → followers, last post date
   - LinkedIn company scraper → followers, employee count
   - X scraper → followers, last tweet date
   - Write results into `socials`; mark status `active` (posted <60 days ago),
     `dead` (no post in 60+ days), based on last_post_at
3. **Score** (write to `scores` with evidence in `reasons`):
   - presence_gap_score: no accounts at all = max; accounts but dead = high;
     alive but tiny following = medium; active + sizable = low (skip)
   - fit_score: is_hiring, recent batch, team size 3–20 (big enough to need
     help, small enough to have no marketer)
   - total_score = weighted combination
- API keys (APIFY_TOKEN, SERPER_API_KEY) in .env.local. Rate-limit politely,
  make the pipeline resumable (skip companies checked in last 30 days).
- Budget guardrail: ~300 companies × 4 platforms ≈ $5–15 on Apify. Log spend.

**Done when:** I run one command/route and get a ranked "biggest gap" list for
all imported companies, each with stored evidence.

## Part 4 — Dashboard

- Ranked company list by total_score: name, score, batch, team size,
  hiring badge, per-platform presence icons (missing / dead / active),
  outreach stage
- Company detail view: full score breakdown with evidence ("No LinkedIn page;
  IG found but last post 94 days ago; 112 followers"), founder contacts,
  links to YC profile / website / any found socials
- Filters: batch, hiring only, score threshold
- Simple add/edit company form
- Deploy to Vercel

**Done when:** I open it in the morning and know exactly which 5 founders to
message today. This screen is also my interview demo.

## Part 5 — AI outreach drafts

- "Draft message" button on company detail → calls Claude API
  (model: claude-sonnet-5) with: company data, score evidence, founder name,
  and my background (AUEB econ student, runs an AI agency, in SF for YC
  Startup School until July 30, targeting GTM roles)
- The draft must NAME THE SPECIFIC GAP with evidence, e.g. "noticed you have
  no LinkedIn page and your last post on X was in March" — and make one clear
  ask (a short call or coffee while I'm in SF)
- Short (under 120 words), casual, specific — never generic AI-slop
- Saved to outreach.message_text as a draft I edit and send manually;
  stage moves to `drafted`. The tool never sends anything.

**Done when:** drafts need only light edits before I'd genuinely send them.

## Part 6 — Pipeline tracking & proof

- Update outreach stage from the dashboard (dropdown per company)
- Marking `sent` auto-sets next_followup_at to +4 days
- "Due today" view: everyone whose follow-up date has passed
- Stats bar: messages sent, reply rate, meetings booked — my headline stat
  for interviews ("found N YC startups with zero social presence, messaged
  X founders, Y% replied")

**Done when:** the tool, not my memory, tells me who to nudge — and the stats
bar tells my story.
