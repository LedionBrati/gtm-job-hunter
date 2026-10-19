# gtm-job-hunter

A tool I built to find my next job.

It finds recent YC startups with a weak social presence, scores how big the gap is, and drafts a message to the founder that names the gap with real evidence. Then I read it, fix it, and send it myself. The tool never sends anything.

## Why I built it

I'm Ledi, an economics student at AUEB in Athens. In July 2026 I went to San Francisco for YC Startup School, and I wanted a GTM or growth role at an early stage startup.

Cold messages like "hi, I'd love to help with growth" don't work. So I flipped it. If a YC company has no LinkedIn page and an X account nobody follows, that gap is the pitch. The tool finds the gap, my message offers to fix it.

It's also my portfolio piece. If I say I can do GTM with AI, this is the proof.

## What it does

1. **Imports YC companies.** Pulls recent batches (W25, S25, W26) from the YC directory into Postgres, with founders as contacts.
2. **Finds their socials.** Scans each company website for LinkedIn, X, Instagram and TikTok links. If the site has none, it searches Google through Serper and checks the match against the company website.
3. **Measures them.** Apify scrapers pull follower counts for the accounts it found.
4. **Scores the gap.** Each company gets a presence gap score and a fit score (hiring, recent batch, team size 3 to 20). Every score stores its evidence, like "LinkedIn page has 642 followers" or "No X account found", so the dashboard can show why.
5. **Dashboard.** A ranked list with filters, a detail page per company, and a stats band. I open it and know which founders to message today.
6. **AI drafts.** One click sends the company facts and the stored evidence to OpenAI (gpt-5.2) and saves a draft under 120 words. Only confirmed findings reach the model, so it can't invent a gap.
7. **Pipeline.** Stage per company (drafted, sent, replied, meeting, dead). Marking one as sent sets a follow up 4 days later, and a "due" view shows who to nudge.

## Numbers

- 531 YC companies and 1063 founder contacts imported
- 1425 social rows checked across 4 platforms
- 455 of 532 LinkedIn pages measured (85%)
- Total Apify spend for the LinkedIn re-run: $0.10
- First live draft: 7 seconds, 72 words, quoted the real follower count

## Things I learned the hard way

**Supabase quietly caps reads at 1000 rows.** Calling `.limit(5000)` still gives you 1000 rows, with no error. An early check undercounted LinkedIn rows because of this and sent me chasing a bug that didn't exist. Every big query now pages through the results.

**Scores are insert only.** Each scoring run appends a new row per company, so the app always reads the newest one. I kept the history on purpose.

**Status is not data.** My scoring checked `status === "found"` before looking at followers, so all 455 measured LinkedIn pages scored as if nobody had measured them. After the fix, companies with a real follower number in their evidence went from 6 to 457.

**I tried PCA for the weights and it ranked the best targets last.** With two inputs that are slightly negatively correlated it gave fit a negative weight. Now it's a plain judgement call, 0.6 gap and 0.4 fit, with a comment explaining why.

**Scrapers fail silently.** The Apify LinkedIn actor doesn't follow redirects, so an old company URL returned an empty result and still got billed. One free request to resolve the redirect first fixed it. Numeric LinkedIn ids only work when signed in, so those get skipped before paying for a run.

**Next.js 16 changed things.** `params` and `searchParams` are async now, middleware is called `proxy.ts`, and a `"use server"` file can only export async functions. That last one passed `tsc` and still broke `next build`. So a clean typecheck doesn't mean the app builds.

**Stale facts become lies.** The prompt can say I'm in SF on certain dates. The trip is over, so that setting is empty, and the drafts ask for a short call instead of claiming I'm in town.

## Honest status

All 6 parts of the plan are done. The dashboard runs on Vercel behind a password, because it holds real founders' names and emails, so there's no public demo.

What's still open:

- X and Instagram followers need a paid Apify plan, so 332 X rows and 117 Instagram rows have no numbers yet.
- 57 LinkedIn pages are stored as numeric ids and can't be scraped logged out.
- The drafts still mix "hire me" and "let my agency help you". I need to pick one.

The full working notes are in [STATUS.md](STATUS.md) and the original build plan is in [PLAN.md](PLAN.md).

## Stack

Next.js 16, TypeScript, Tailwind, Supabase (Postgres), Vercel, Serper, Apify, OpenAI.

## Run it

You need your own Supabase project and API keys. Create `.env.local` with:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SERPER_API_KEY=
APIFY_TOKEN=
OPENAI_API_KEY=
DASHBOARD_PASSWORD=
```

Then:

```bash
npm install
npx supabase db push        # apply the migrations in supabase/migrations
npm run import:yc           # import YC companies
npm run discover:socials    # find social accounts
npm run enrich:socials      # follower counts (TEST_LIMIT=3 to try it cheap)
npm run score:companies     # score every company, free
npm run dev
```

`npm run backup` saves a copy of the data to `backups/`, which is gitignored because it holds personal data.

Built by Ledi Brati.
