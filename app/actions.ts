"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { draftOutreachMessage } from "@/lib/openai";
import { getCompany } from "@/lib/queries";
import { pickChannel } from "@/lib/outreach-prompt";
import { STAGES, stagePatch, isoDate, FOLLOWUP_DAYS, type Stage } from "@/lib/stages";

export type FormState = { error: string | null };

interface CompanyInput {
  name: string;
  website: string | null;
  yc_batch: string | null;
  one_liner: string | null;
  industry: string | null;
  team_size: number | null;
  location: string | null;
  is_hiring: boolean;
  yc_url: string | null;
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCompany(formData: FormData): CompanyInput | { error: string } {
  const name = text(formData, "name");
  if (!name) return { error: "Name is required." };

  const rawTeamSize = text(formData, "team_size");
  let team_size: number | null = null;
  if (rawTeamSize !== null) {
    const parsed = Number(rawTeamSize);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Team size must be a whole number, or left blank." };
    }
    team_size = parsed;
  }

  return {
    name,
    website: text(formData, "website"),
    yc_batch: text(formData, "yc_batch"),
    one_liner: text(formData, "one_liner"),
    industry: text(formData, "industry"),
    team_size,
    location: text(formData, "location"),
    is_hiring: formData.get("is_hiring") === "on",
    yc_url: text(formData, "yc_url"),
  };
}

export async function createCompany(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = parseCompany(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("companies")
    .insert(parsed)
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/");
  // redirect() signals by throwing, so it must sit outside any try/catch.
  redirect(`/company/${data.id}`);
}

export async function updateCompany(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = parseCompany(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("companies").update(parsed).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath(`/company/${id}`);
  redirect(`/company/${id}`);
}

/* ---------------------------------------------------------------- outreach */

export type DraftState = { error: string | null; draft: string | null };

/**
 * There is no unique constraint on outreach.company_id, so an upsert() would
 * happily create a second row. Read first, then update or insert.
 */
async function upsertOutreach(
  companyId: string,
  patch: Record<string, unknown>
): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from("outreach")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (readError) return readError.message;

  const { error } = existing
    ? await supabase.from("outreach").update(patch).eq("id", existing.id)
    : await supabase.from("outreach").insert({ company_id: companyId, ...patch });
  return error?.message ?? null;
}

/**
 * Drafts a message with Claude and stores it. This NEVER sends anything —
 * Ledi reads, edits and sends every message by hand.
 */
export async function draftMessage(
  companyId: string,
  contactId: string,
  _prev: DraftState,
  _formData: FormData
): Promise<DraftState> {
  const company = await getCompany(companyId);
  if (!company) return { error: "Company not found.", draft: null };

  const contact = company.contacts.find((c) => c.id === contactId);
  if (!contact) return { error: "Contact not found on this company.", draft: null };

  let draft: string;
  try {
    draft = await draftOutreachMessage(company, contact);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), draft: null };
  }

  const failure = await upsertOutreach(companyId, {
    contact_id: contact.id,
    stage: "drafted",
    message_text: draft,
    channel: pickChannel(contact),
  });
  if (failure) return { error: `Draft written but not saved: ${failure}`, draft };

  revalidatePath("/");
  revalidatePath(`/company/${companyId}`);
  return { error: null, draft };
}

/** Saves Ledi's edits to a draft. */
export async function saveDraft(
  companyId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const message = text(formData, "message_text");
  const failure = await upsertOutreach(companyId, {
    message_text: message,
    stage: "drafted",
  });
  if (failure) return { error: failure };

  revalidatePath(`/company/${companyId}`);
  return { error: null };
}

/* ------------------------------------------------------------------ stages */

/**
 * Moves a company along the pipeline.
 *
 * Marking `sent` stamps sent_at and schedules the follow-up. Stages past
 * `sent` also backfill sent_at if it is missing: the message obviously went
 * out at some point, and `sent_at` is what the stats count as "messaged", so
 * a founder who replied must never leave the denominator empty.
 *
 * Reaching `replied`/`meeting`/`dead` clears next_followup_at — the
 * conversation resolved itself and nudging is over.
 */
export async function updateStage(
  companyId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const stage = String(formData.get("stage") ?? "");
  if (!(STAGES as readonly string[]).includes(stage)) {
    return { error: `Unknown stage "${stage}".` };
  }

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("outreach")
    .select("id, sent_at")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  const patch = stagePatch(stage as Stage, existing?.sent_at ?? null);

  const failure = await upsertOutreach(companyId, patch);
  if (failure) return { error: failure };

  revalidatePath("/");
  revalidatePath(`/company/${companyId}`);
  return { error: null };
}

/** Pushes the next follow-up out by another few days without changing stage. */
export async function snoozeFollowup(
  companyId: string,
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const failure = await upsertOutreach(companyId, {
    next_followup_at: isoDate(FOLLOWUP_DAYS),
  });
  if (failure) return { error: failure };
  revalidatePath("/");
  revalidatePath(`/company/${companyId}`);
  return { error: null };
}
