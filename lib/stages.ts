/**
 * Pipeline stages, mirroring the `outreach_stage` enum in the database.
 *
 * These live here rather than in app/actions.ts because that file is
 * "use server": such a module may only export async functions, so exporting a
 * plain array from it fails the build (types are fine — they are erased).
 */
export const STAGES = [
  "not_started",
  "drafted",
  "sent",
  "replied",
  "meeting",
  "dead",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  not_started: "Not started",
  drafted: "Drafted",
  sent: "Sent",
  replied: "Replied",
  meeting: "Meeting",
  dead: "Dead",
};

/** Days after sending before the tool asks Ledi to nudge again. */
export const FOLLOWUP_DAYS = 4;

export function isoDate(daysFromNow: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * The database patch for moving a company to `stage`. Pure, so the rules below
 * are testable without a Next request context or a round-trip to Supabase.
 *
 * - `sent` stamps sent_at and schedules the follow-up.
 * - Stages past `sent` backfill sent_at when it is missing: the message
 *   obviously went out, and sent_at is what the stats count as "messaged", so
 *   a founder who replied must never be missing from the denominator.
 * - Resolved stages clear the follow-up — the conversation is over.
 * - `not_started` is a full reset, so a mis-click cannot leave a phantom
 *   "messaged" in the interview stats.
 */
export function stagePatch(
  stage: Stage,
  alreadySentAt: string | null,
  now = new Date()
): Record<string, unknown> {
  const patch: Record<string, unknown> = { stage };
  const past = stage === "sent" || stage === "replied" || stage === "meeting";
  const resolved = stage === "replied" || stage === "meeting" || stage === "dead";

  if (past && !alreadySentAt) patch.sent_at = now.toISOString();
  if (stage === "sent") patch.next_followup_at = isoDate(FOLLOWUP_DAYS, now);
  if (resolved) patch.next_followup_at = null;
  if (stage === "not_started") {
    patch.sent_at = null;
    patch.next_followup_at = null;
  }
  return patch;
}
