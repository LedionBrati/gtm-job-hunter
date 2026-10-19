import dotenv from "dotenv";
import { supabaseAdmin } from "../lib/supabase";

dotenv.config({ path: ".env.local" });

// Only LinkedIn and TikTok are enriched via Apify for now — Instagram and X
// scrapers require a paid Apify plan (confirmed via live smoke test), and
// Ledi opted to review those manually rather than add billing right now.
// Their socials rows stay at status "found" (URL known, not yet enriched).
const ENRICHABLE_PLATFORMS = ["linkedin", "tiktok"];

const STALE_DAYS = 60;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

// Actor payloads vary per scraper, so items stay loosely typed and each
// enrich* function picks out only the fields it knows about.
type ApifyItem = Record<string, unknown>;

async function runApifyActor(actorId: string, input: unknown, token: string): Promise<ApifyItem[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(280000),
    }
  );
  if (!res.ok) throw new Error(`Apify actor ${actorId} failed: ${res.status}`);
  return res.json();
}

function extractLinkedinSlug(url: string): string | null {
  const match = url.match(/linkedin\.com\/company\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractTiktokHandle(url: string): string | null {
  const match = url.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);
  return match ? match[1] : null;
}

/**
 * LinkedIn 301s an outdated or alias company slug to its canonical one
 * (e.g. /company/digpangolin -> /company/pangolin-net). The Apify actor does
 * NOT follow that redirect — it just returns an empty dataset — so a stale
 * slug silently costs an actor run and yields nothing. Resolving it ourselves
 * is one free request.
 *
 * A redirect to the login wall means the stored URL is a bare numeric company
 * id, which only resolves for signed-in users. Those can never be scraped
 * logged-out, so return null and skip them rather than pay for a run that is
 * guaranteed to come back as a "Login to LinkedIn" stub.
 */
async function resolveLinkedinSlug(slug: string): Promise<string | null> {
  if (/^\d+$/.test(slug)) return null; // numeric id — login wall, don't bother
  try {
    const res = await fetch(`https://www.linkedin.com/company/${slug}`, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 200) return slug;
    const location = res.headers.get("location");
    if (!location) return slug;
    if (/\/uas\/login|\/login|authwall/.test(location)) return null;
    const match = location.match(/\/company\/([^/?#]+)/);
    return match ? match[1] : slug;
  } catch {
    // Network hiccup: fall through and let the actor try the original slug.
    return slug;
  }
}

async function enrichLinkedin(url: string, token: string): Promise<{ followers: number | null; lastPostAt: string | null } | null> {
  // Discovery sometimes stores a company URL wrapped in extra path/query
  // noise (an admin dashboard link, a `?viewAsMember=true` tail) — the
  // actor only wants the bare company page, so we re-derive it from the
  // slug/id rather than passing the stored URL through as-is.
  const rawSlug = extractLinkedinSlug(url);
  if (!rawSlug) return null;
  const slug = await resolveLinkedinSlug(rawSlug);
  if (!slug) return null;
  const cleanUrl = `https://www.linkedin.com/company/${slug}`;

  const items = await runApifyActor(
    "automation-lab~linkedin-company-scraper",
    { companyUrls: [cleanUrl] },
    token
  );
  const item = items[0];
  if (!item) return null;
  // This actor returns company profile stats only — no posting activity,
  // so lastPostAt stays null (freshness is unknown, not assumed dead).
  return { followers: asNumber(item.followerCount), lastPostAt: null };
}

async function enrichTiktok(url: string, token: string): Promise<{ followers: number | null; lastPostAt: string | null } | null> {
  const handle = extractTiktokHandle(url);
  if (!handle) return null;
  const items = await runApifyActor(
    "clockworks~tiktok-profile-scraper",
    { profiles: [handle], resultsPerPage: 1, profileSorting: "latest" },
    token
  );
  const item = items[0];
  if (!item) return null;
  const authorMeta = (item.authorMeta ?? {}) as Record<string, unknown>;
  return {
    followers: asNumber(authorMeta.fans),
    lastPostAt: typeof item.createTimeISO === "string" ? item.createTimeISO : null,
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface EnrichableRow {
  id: string;
  company_id: string;
  platform: string;
  url: string | null;
  companies: {
    name: string;
    is_hiring: boolean | null;
    team_size: number | null;
    yc_batch: string | null;
  } | null;
}

// Spend the limited Apify budget on the companies most worth messaging first.
function priority(company: EnrichableRow["companies"]): number {
  if (!company) return 0;
  let score = 0;
  if (company.is_hiring) score += 30;
  if (company.team_size !== null && company.team_size >= 3 && company.team_size <= 20) {
    score += 40;
  }
  if (company.yc_batch === "W26") score += 30;
  else if (company.yc_batch === "S25" || company.yc_batch === "W25") score += 20;
  return score;
}

async function main() {
  const supabase = supabaseAdmin();
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) throw new Error("Missing APIFY_TOKEN in env");

  const { data: rows, error } = await supabase
    .from("socials")
    .select("id, company_id, platform, url, companies(name, is_hiring, team_size, yc_batch)")
    .in("platform", ENRICHABLE_PLATFORMS)
    .eq("status", "found")
    .is("followers", null)
    .not("url", "is", null);
  if (error) throw error;

  const socialRows = (rows ?? []) as unknown as EnrichableRow[];
  let ranked = [...socialRows].sort(
    (a, b) => priority(b.companies) - priority(a.companies)
  );
  if (process.env.TEST_LIMIT) {
    ranked = ranked.slice(0, Number(process.env.TEST_LIMIT));
  }

  console.log(`${ranked.length} socials rows to enrich (LinkedIn + TikTok only)`);

  let cumulativeSpend = 0;
  let enriched = 0;
  let failed = 0;

  for (const [i, row] of ranked.entries()) {
    const companyName = row.companies?.name ?? "?";
    try {
      const result =
        row.platform === "linkedin"
          ? await enrichLinkedin(row.url!, apifyToken)
          : await enrichTiktok(row.url!, apifyToken);

      if (!result) {
        console.log(`[${i + 1}/${ranked.length}] ${companyName} (${row.platform}) — no data returned`);
        failed++;
        continue;
      }

      const status =
        result.lastPostAt !== null
          ? daysSince(result.lastPostAt) <= STALE_DAYS
            ? "active"
            : "dead"
          : "found";

      const { error: updateError } = await supabase
        .from("socials")
        .update({
          followers: result.followers,
          last_post_at: result.lastPostAt,
          status,
          checked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;

      // Rough estimate; Apify's per-run cost varies by actor/plan tier —
      // this is a visibility aid, not a billing source of truth.
      cumulativeSpend += row.platform === "linkedin" ? 0.00345 : 0.001;
      enriched++;
      console.log(
        `[${i + 1}/${ranked.length}] ${companyName} (${row.platform}) — followers=${result.followers} status=${status} | est. cumulative spend: $${cumulativeSpend.toFixed(3)}`
      );
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${i + 1}/${ranked.length}] ${companyName} (${row.platform}) — FAILED: ${message}`);
    }
    await sleep(300);
  }

  console.log("\n=== Enrichment summary ===");
  console.log(`Enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
  console.log(`Estimated cumulative spend: $${cumulativeSpend.toFixed(3)}`);
}

main();
