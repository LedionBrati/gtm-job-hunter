"use client";

import { useActionState } from "react";
import { updateStage, snoozeFollowup, type FormState } from "@/app/actions";
import { STAGES, STAGE_LABEL } from "@/lib/stages";

export function StageControl({
  companyId,
  stage,
  nextFollowupAt,
  sentAt,
}: {
  companyId: string;
  stage: string | null;
  nextFollowupAt: string | null;
  sentAt: string | null;
}) {
  const [state, run, saving] = useActionState<FormState, FormData>(
    updateStage.bind(null, companyId),
    { error: null }
  );
  const [snoozeState, runSnooze, snoozing] = useActionState<FormState, FormData>(
    snoozeFollowup.bind(null, companyId),
    { error: null }
  );

  const current = stage ?? "not_started";
  const today = new Date().toISOString().slice(0, 10);
  const overdue = nextFollowupAt !== null && nextFollowupAt <= today;

  return (
    <div className="mt-6">
      {/* Submitting on change keeps this one click: pick the stage, done. */}
      <form action={run} className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="label-muted">Stage</span>
          <select
            name="stage"
            defaultValue={current}
            disabled={saving}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="field w-auto min-w-[12rem]"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {saving && <span className="label-muted pb-3">Saving…</span>}

        {/* No JS fallback, and a visible affordance that the select submits. */}
        <noscript>
          <button type="submit" className="btn mb-1">
            Update
          </button>
        </noscript>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-[0.875rem] text-meta">
          {sentAt
            ? `Sent ${sentAt.slice(0, 10)}`
            : "Not sent yet"}
        </span>
        {nextFollowupAt && (
          <span
            className={`text-[0.875rem] ${overdue ? "text-accent" : "text-meta"}`}
          >
            {overdue ? `Follow up now — due ${nextFollowupAt}` : `Follow up ${nextFollowupAt}`}
          </span>
        )}
        {nextFollowupAt && (
          <form action={runSnooze}>
            <button
              type="submit"
              disabled={snoozing}
              className="label-muted underline-grow bg-transparent"
            >
              {snoozing ? "Snoozing…" : "Snooze 4 days"}
            </button>
          </form>
        )}
      </div>

      {(state.error || snoozeState.error) && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-accent bg-accent-dim px-4 py-3 text-[0.9rem] text-text"
        >
          {state.error ?? snoozeState.error}
        </p>
      )}
    </div>
  );
}
