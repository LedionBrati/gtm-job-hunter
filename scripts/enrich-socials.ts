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

async function runApifyActor(actorId: string, input: unknown, token: string): Promise<any[]> {
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

async function enrichLinkedin(url: string, token: string): Promise<{ followers: number | null; lastPostAt: string | null } | null> {
  const items = await runApifyActor(
    "automation-lab~linkedin-company-scraper",
    { companyUrls: [url] },
    token
  );
  const item = items[0];
  if (!item) return null;
  // This actor returns company profile stats only — no posting activity,
  // so lastPostAt stays null (freshness is unknown, not assumed dead).
  return { followers: item.followerCount ?? null, lastPostAt: null };
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
  return {
    followers: item.authorMeta?.fans ?? null,
    lastPostAt: item.createTimeISO ?? null,
  };
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

  let ranked = [...(rows ?? [])].sort((a: any, b: any) => {
    const score = (c: any) => {
      let s = 0;
      if (c?.is_hiring) s += 30;
      if (c?.team_size >= 3 && c?.team_size <= 20) s += 40;
      if (c?.yc_batch === "W26") s += 30;
      else if (c?.yc_batch === "S25" || c?.yc_batch === "W25") s += 20;
      return s;
    };
    return score(b.companies) - score(a.companies);
  });
  if (process.env.TEST_LIMIT) {
    ranked = ranked.slice(0, Number(process.env.TEST_LIMIT));
  }

  console.log(`${ranked.length} socials rows to enrich (LinkedIn + TikTok only)`);

  let cumulativeSpend = 0;
  let enriched = 0;
  let failed = 0;

  for (const [i, row] of ranked.entries()) {
    const companyName = (row as any).companies?.name ?? "?";
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
