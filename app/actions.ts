"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";

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
