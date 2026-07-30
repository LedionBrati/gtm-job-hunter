<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Read STATUS.md first

**`STATUS.md` is the current state of this project — read it before doing
anything.** It records which of `PLAN.md`'s 6 parts are done, what to work on
next, the design system this app deliberately imitates, and several
non-obvious traps (insert-only `scores` table, PostgREST's silent 1000-row
cap, an exhausted Apify quota, deliberately hardcoded scoring weights that
must not be "improved" back into PCA).

Work ONE part of `PLAN.md` at a time and stop so Ledi can verify, as that
file instructs. Keep `STATUS.md` updated as you finish work.
