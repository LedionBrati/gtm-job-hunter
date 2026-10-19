"use client";

import { useActionState, useState } from "react";
import { draftMessage, saveDraft, type DraftState, type FormState } from "@/app/actions";
import type { Contact } from "@/lib/queries";

export function OutreachPanel({
  companyId,
  contacts,
  initialMessage,
  initialContactId,
}: {
  companyId: string;
  contacts: Contact[];
  initialMessage: string | null;
  initialContactId: string | null;
}) {
  const [contactId, setContactId] = useState(
    initialContactId ?? contacts.find((c) => c.is_founder)?.id ?? contacts[0]?.id ?? ""
  );
  const [edited, setEdited] = useState<string | null>(null);
  const [seenDraft, setSeenDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [draftState, runDraft, drafting] = useActionState<DraftState, FormData>(
    draftMessage.bind(null, companyId, contactId),
    { error: null, draft: null }
  );
  const [saveState, runSave, saving] = useActionState<FormState, FormData>(
    saveDraft.bind(null, companyId),
    { error: null }
  );

  // A fresh draft replaces whatever is in the box. Adjusting during render
  // rather than in an effect keeps it to one render pass.
  if (draftState.draft !== seenDraft) {
    setSeenDraft(draftState.draft);
    setEdited(null);
  }

  const body = edited ?? draftState.draft ?? initialMessage ?? "";
  const contact = contacts.find((c) => c.id === contactId) ?? null;
  const channel = contact?.email ? "email" : "linkedin";
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  async function copy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (contacts.length === 0) {
    return (
      <p className="mt-6 text-[0.9rem] text-meta">
        No contacts captured for this company, so there is nobody to draft a message
        to. Add a founder first.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <form action={runDraft} className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="label-muted">Write to</span>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="field w-auto min-w-[16rem]"
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` — ${c.role}` : ""}
                {c.is_founder ? " (founder)" : ""}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={drafting} className="btn disabled:opacity-50">
          {drafting ? "Drafting…" : body ? "Redraft" : "Draft message"}
        </button>

        <span className="label-muted pb-3">
          via {channel}
          {contact?.email ? ` · ${contact.email}` : ""}
        </span>
      </form>

      {drafting && (
        <p className="mt-4 text-[0.9rem] text-dim">
          Reading the score evidence and writing. This takes a few seconds.
        </p>
      )}

      {draftState.error && (
        <p
          role="alert"
          className="mt-5 border-l-2 border-accent bg-accent-dim px-4 py-3 text-[0.9rem] text-text"
        >
          {draftState.error}
        </p>
      )}

      {body && (
        <form action={runSave} className="mt-7 max-w-[70ch]">
          <textarea
            name="message_text"
            value={body}
            onChange={(e) => setEdited(e.target.value)}
            rows={9}
            className="field field-prose resize-y"
          />

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="submit" disabled={saving} className="btn disabled:opacity-50">
              {saving ? "Saving…" : "Save edits"}
            </button>
            <button type="button" onClick={copy} className="btn btn-ghost">
              {copied ? "Copied" : "Copy"}
            </button>
            <span className={`label-muted ${words > 120 ? "text-accent" : ""}`}>
              {words} words
            </span>
          </div>

          {saveState.error && (
            <p
              role="alert"
              className="mt-5 border-l-2 border-accent bg-accent-dim px-4 py-3 text-[0.9rem] text-text"
            >
              {saveState.error}
            </p>
          )}

          <p className="mt-6 max-w-[58ch] text-[0.875rem] leading-[1.65] text-meta">
            Nothing is ever sent from here. Copy it, read it once more, and send it
            yourself.
          </p>
        </form>
      )}
    </div>
  );
}
