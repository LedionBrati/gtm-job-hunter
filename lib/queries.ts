import { supabaseAdmin } from "./supabase";
import { relevantPlatforms } from "./platform-relevance";

export type SocialStatus = "not_found" | "found" | "dead" | "active";

export interface Social {
  platform: string;
  url: string | null;
  followers: number | null;
  last_post_at: string | null;
  status: SocialStatus;
  checked_at: string | null;
}

export interface Reason {
  criterion: string;
  points: number;
  evidence: string;
}

export interface Score {
  presence_gap_score: number;
  fit_score: number;
  total_score: number;
  reasons: Reason[];
  scored_at: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  is_founder: boolean;
  linkedin_url: string | null;
  email: string | null;
}

export interface Outreach {
  stage: string;
  sent_at: string | null;
  next_followup_at: string | null;
  channel: string | null;
}

export interface Company {
  id: string;
  name: string;
  website: string | null;
  yc_batch: string | null;
  one_liner: string | null;
  industry: string | null;
  team_size: number | null;
  location: string | null;
  is_hiring: boolean;
  yc_url: string | null;
  socials: Social[];
  contacts: Contact[];
  outreach: Outreach[];
  score: Score | null;
  /** Platforms worth judging this company on, given its industry. */
  platforms: string[];
}

export interface Filters {
  batch?: string;
  hiring?: boolean;
  minScore?: number;
}

const COMPANY_FIELDS = `
  id, name, website, yc_batch, one_liner, industry, team_size, location,
  is_hiring, yc_url,
  socials ( platform, url, followers, last_post_at, status, checked_at ),
  contacts ( id, name, role, is_founder, linkedin_url, email ),
  outreach ( stage, sent_at, next_followup_at, channel ),
  scores ( presence_gap_score, fit_score, total_score, reasons, scored_at )
`;

// scores is insert-only (each scoring run appends a fresh row per company),
// so "the score" is always the newest row — never assume there's just one.
function latestScore(rows: Score[] | null): Score | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort(
    (a, b) => new Date(b.scored_at).getTime() - new Date(a.scored_at).getTime()
  )[0];
}

function shape(row: Record<string, unknown>): Company {
  const scores = (row.scores ?? []) as Score[];
  return {
    ...(row as unknown as Omit<Company, "score" | "platforms">),
    score: latestScore(scores),
    platforms: relevantPlatforms((row.industry as string | null) ?? null),
  };
}

export async function getRankedCompanies(filters: Filters = {}): Promise<Company[]> {
  const supabase = supabaseAdmin();

  let query = supabase.from("companies").select(COMPANY_FIELDS);
  if (filters.batch) query = query.eq("yc_batch", filters.batch);
  if (filters.hiring) query = query.eq("is_hiring", true);

  // PostgREST caps unbounded selects at 1000 rows; be explicit so growth
  // past that point fails loudly rather than silently truncating the list.
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(`Failed to load companies: ${error.message}`);

  const companies = (data ?? []).map(shape);

  const min = filters.minScore ?? 0;
  return companies
    .filter((c) => (c.score?.total_score ?? 0) >= min)
    .sort((a, b) => (b.score?.total_score ?? 0) - (a.score?.total_score ?? 0));
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load company: ${error.message}`);
  return data ? shape(data) : null;
}

/** Distinct batches with counts, for the filter bar. Unfiltered by design. */
export async function getBatches(): Promise<{ batch: string; count: number }[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("companies")
    .select("yc_batch")
    .limit(5000);
  if (error) throw new Error(`Failed to load batches: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const batch = row.yc_batch;
    if (!batch) continue;
    counts.set(batch, (counts.get(batch) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([batch, count]) => ({ batch, count }))
    .sort((a, b) => b.count - a.count);
}
