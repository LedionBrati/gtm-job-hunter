"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/actions";

export interface CompanyDefaults {
  name?: string | null;
  website?: string | null;
  yc_batch?: string | null;
  one_liner?: string | null;
  industry?: string | null;
  team_size?: number | null;
  location?: string | null;
  is_hiring?: boolean;
  yc_url?: string | null;
}

export function CompanyForm({
  action,
  defaults = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: CompanyDefaults;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="mt-10 max-w-2xl">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <input
            name="name"
            required
            defaultValue={defaults.name ?? ""}
            className="field"
            placeholder="Acme Inc."
          />
        </Field>

        <Field label="One-liner" className="sm:col-span-2">
          <textarea
            name="one_liner"
            rows={2}
            defaultValue={defaults.one_liner ?? ""}
            className="field resize-y"
            placeholder="What they do, in a sentence."
          />
        </Field>

        <Field label="Website">
          <input
            name="website"
            type="url"
            defaultValue={defaults.website ?? ""}
            className="field"
            placeholder="https://…"
          />
        </Field>

        <Field label="YC profile URL">
          <input
            name="yc_url"
            type="url"
            defaultValue={defaults.yc_url ?? ""}
            className="field"
            placeholder="https://ycombinator.com/companies/…"
          />
        </Field>

        <Field label="YC batch">
          <input
            name="yc_batch"
            defaultValue={defaults.yc_batch ?? ""}
            className="field"
            placeholder="W26"
          />
        </Field>

        <Field label="Industry">
          <input
            name="industry"
            defaultValue={defaults.industry ?? ""}
            className="field"
            placeholder="B2B"
          />
        </Field>

        <Field label="Team size">
          <input
            name="team_size"
            type="number"
            min="0"
            step="1"
            defaultValue={defaults.team_size ?? ""}
            className="field"
            placeholder="8"
          />
        </Field>

        <Field label="Location">
          <input
            name="location"
            defaultValue={defaults.location ?? ""}
            className="field"
            placeholder="San Francisco, CA"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5 sm:col-span-2">
          <input
            type="checkbox"
            name="is_hiring"
            defaultChecked={defaults.is_hiring ?? false}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="label-muted">Currently hiring</span>
        </label>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mt-7 border-l-2 border-accent bg-accent-dim px-4 py-3 text-[0.9rem] text-text"
        >
          {state.error}
        </p>
      )}

      <div className="mt-9 flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn disabled:opacity-50">
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href={cancelHref} className="label-muted underline-grow no-underline">
          Cancel
        </Link>
      </div>

      <p className="mt-8 max-w-[58ch] text-[0.875rem] leading-[1.65] text-meta">
        Scores are not recalculated here. Run{" "}
        <code className="font-mono text-dim">npm run score:companies</code> after
        adding companies so the ranking picks them up.
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-2 ${className}`}>
      <span className="label-muted">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}
