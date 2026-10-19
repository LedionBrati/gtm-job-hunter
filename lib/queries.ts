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
  id: string;
  contact_id: string | null;
  stage: string;
  message_text: string | null;
  sent_at: string | null;
  next_followup_at: string | null;
  notes: string | null;
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
  /** Only companies whose follow-up date has arrived. */
  due?: boolean;
}

/**
 * Stages that mean the conversation resolved itself. A company that already
 * replied does not need nudging, so it never appears in the due list however
 * old its follow-up date is.
 */
const RESOLVED_STAGES = new Set(["replied", "meeting", "dead"]);

/** True when this company is waiting on a nudge today. */
export function isDue(company: Company, today = new Date()): boolean {
  const outreach = company.outreach[0];
  if (!outreach?.next_followup_at) return false;
  if (RESOLVED_STAGES.has(outreach.stage)) return false;
  // next_followup_at is a DATE column, so compare date-only strings and avoid
  // dragging the local timezone into "is it due yet".
  return outreach.next_followup_at <= today.toISOString().slice(0, 10);
}

const COMPANY_FIELDS = `
  id, name, website, yc_batch, one_liner, industry, team_size, location,
  is_hiring, yc_url,
  socials ( platform, url, followers, last_post_at, status, checked_at ),
  contacts ( id, name, role, is_founder, linkedin_url, email ),
  outreach ( id, contact_id, stage, message_text, sent_at, next_followup_at, notes, channel ),
  scores ( presence_gap_score, fit_score, total_score, reasons, scored_at )
`;

/**
 * PostgREST enforces a server-side max-rows (1000 on Supabase) that a client
 * `.limit()` CANNOT raise — asking for 5000 still returns 1000, with no error
 * and no indication the result was cut. At 531 companies that was invisible,
 * but the whole point of this tool is importing more YC batches, so the first
 * run past 1000 would have silently dropped companies off the ranking.
 * Paging explicitly is the only way to actually read every row.
 */
const PAGE_SIZE = 1000;

async function fetchAllPages(
  buildQuery: (from: number, to: number) => PromiseLike<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>,
  label: string
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load ${label}: ${error.message}`);
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

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

  const rows = await fetchAllPages((from, to) => {
    let query = supabase.from("companies").select(COMPANY_FIELDS).range(from, to);
    if (filters.batch) query = query.eq("yc_batch", filters.batch);
    if (filters.hiring) query = query.eq("is_hiring", true);
    return query;
  }, "companies");

  const companies = rows.map(shape);

  const min = filters.minScore ?? 0;
  return companies
    .filter((c) => (c.score?.total_score ?? 0) >= min)
    .filter((c) => !filters.due || isDue(c))
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
  const rows = await fetchAllPages(
    (from, to) => supabase.from("companies").select("yc_batch").range(from, to),
    "batches"
  );

  const counts = new Map<string, number>();
  for (const row of rows as { yc_batch: string | null }[]) {
    const batch = row.yc_batch;
    if (!batch) continue;
    counts.set(batch, (counts.get(batch) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([batch, count]) => ({ batch, count }))
    .sort((a, b) => b.count - a.count);
}

export interface PipelineStats {
  drafted: number;
  messaged: number;
  replied: number;
  meetings: number;
  due: number;
  /** null until something has actually been sent — 0% would be a lie. */
  replyRate: number | null;
}

/**
 * The numbers Ledi quotes in interviews, so they have to be honest.
 *
 * "Messaged" counts `sent_at`, not `stage === "sent"`. Stage holds only the
 * CURRENT state, so a founder who replied is no longer at "sent" — counting
 * stages would make the denominator shrink every time someone answered, and
 * push the reply rate towards a meaningless 100%. `sent_at` is a timestamp
 * that never moves backwards, so it is the honest denominator.
 */
export async function getPipelineStats(): Promise<PipelineStats> {
  const supabase = supabaseAdmin();
  const rows = (await fetchAllPages(
    (from, to) =>
      supabase.from("outreach").select("stage, sent_at, next_followup_at").range(from, to),
    "pipeline stats"
  )) as { stage: string; sent_at: string | null; next_followup_at: string | null }[];

  const today = new Date().toISOString().slice(0, 10);
  const messaged = rows.filter((r) => r.sent_at !== null).length;
  const replied = rows.filter((r) => r.stage === "replied" || r.stage === "meeting").length;

  return {
    drafted: rows.filter((r) => r.stage === "drafted").length,
    messaged,
    replied,
    meetings: rows.filter((r) => r.stage === "meeting").length,
    due: rows.filter(
      (r) =>
        r.next_followup_at !== null &&
        r.next_followup_at <= today &&
        !RESOLVED_STAGES.has(r.stage)
    ).length,
    replyRate: messaged > 0 ? replied / messaged : null,
  };
}
