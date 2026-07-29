import dotenv from "dotenv";
import { supabaseAdmin } from "../lib/supabase";
import { relevantPlatforms, findPlatformUrl, PLATFORM_SEARCH_DOMAINS } from "../lib/platform-relevance";

dotenv.config({ path: ".env.local" });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return 400 + Math.random() * 400;
}

async function scanWebsiteForPlatform(website: string, platform: string): Promise<string | null> {
  try {
    const res = await fetch(website, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; gtm-job-hunter-discover/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return findPlatformUrl(html, platform);
  } catch {
    return null;
  }
}

async function serperSearch(companyName: string, website: string | null, platform: string, apiKey: string): Promise<string | null> {
  const domain = PLATFORM_SEARCH_DOMAINS[platform];
  const websiteHint = website ? ` "${website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}"` : "";
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `"${companyName}"${websiteHint} site:${domain}` }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const organic = data.organic ?? [];
    for (const result of organic) {
      const found = findPlatformUrl(result.link ?? "", platform);
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

// Common words/short names (e.g. "Lucid") collide with unrelated, much
// bigger companies in search results. LinkedIn's public page HTML includes
// the listed company website, so a Serper-sourced LinkedIn match can be
// cross-checked against the actual company website before we trust it.
// (X/Instagram/TikTok don't server-render enough to verify this way — those
// stay unverified when sourced via Serper, which is why the website-scan
// path, using links the company published itself, is tried first.)
async function verifyLinkedinMatch(candidateUrl: string, website: string | null): Promise<boolean> {
  if (!website) return true;
  const domain = website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").split("/")[0];
  try {
    const res = await fetch(candidateUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; gtm-job-hunter-discover/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return false;
    const html = await res.text();
    // A blanket substring search over the whole page is too loose — company
    // LinkedIn pages often show a feed of posts (e.g. "10 YC startups worth
    // a look") that can incidentally mention an unrelated company's domain.
    // The schema.org JSON-LD block's "sameAs" field is the page's own
    // declared website, which is what we actually want to check against.
    const sameAsMatch = html.match(/"sameAs":"https?:\/\/(?:www\.)?([^"/]+)/);
    if (sameAsMatch) return sameAsMatch[1].toLowerCase() === domain.toLowerCase();
    return false;
  } catch {
    return false;
  }
}

interface CompanyRow {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  is_hiring: boolean;
  team_size: number | null;
  yc_batch: string;
}

function priorityScore(company: CompanyRow, hasZeroSocials: boolean): number {
  let score = 0;
  if (company.is_hiring) score += 30;
  if (company.team_size !== null && company.team_size >= 3 && company.team_size <= 20) score += 40;
  if (company.yc_batch === "W26") score += 30;
  else if (company.yc_batch === "S25" || company.yc_batch === "W25") score += 20;
  if (hasZeroSocials) score += 50;
  return score;
}

async function main() {
  const supabase = supabaseAdmin();
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) throw new Error("Missing SERPER_API_KEY in env");

  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, website, industry, is_hiring, team_size, yc_batch");
  if (companiesError) throw companiesError;

  const { data: existingSocials, error: socialsError } = await supabase
    .from("socials")
    .select("company_id, platform");
  if (socialsError) throw socialsError;

  const existingByCompany = new Map<string, Set<string>>();
  for (const row of existingSocials ?? []) {
    if (!existingByCompany.has(row.company_id)) existingByCompany.set(row.company_id, new Set());
    existingByCompany.get(row.company_id)!.add(row.platform);
  }

  let ranked = [...(companies as CompanyRow[])].sort((a, b) => {
    const aZero = (existingByCompany.get(a.id)?.size ?? 0) === 0;
    const bZero = (existingByCompany.get(b.id)?.size ?? 0) === 0;
    return priorityScore(b, bZero) - priorityScore(a, aZero);
  });
  if (process.env.TEST_LIMIT) {
    ranked = ranked.slice(0, Number(process.env.TEST_LIMIT));
  }

  let found = 0;
  let notFound = 0;
  let skipped = 0;

  for (const [i, company] of ranked.entries()) {
    const relevant = relevantPlatforms(company.industry);
    const known = existingByCompany.get(company.id) ?? new Set();
    const toCheck = relevant.filter((p) => !known.has(p));

    if (toCheck.length === 0) {
      skipped++;
      continue;
    }

    for (const platform of toCheck) {
      let url: string | null = null;

      if (company.website) {
        url = await scanWebsiteForPlatform(company.website, platform);
      }
      // Serper is only used as a fallback for LinkedIn, where a match can be
      // verified against the company's own website. For X/Instagram/TikTok
      // there's no reliable way to verify a Serper-sourced match (their pages
      // don't server-render enough to check), and generic company names
      // (e.g. "Lucid") collide with unrelated, much bigger companies in
      // search results — a wrong link here could end up in outreach, so a
      // missed account (not_found) is far cheaper than a false positive.
      if (!url && platform === "linkedin") {
        await sleep(randomDelay());
        const candidate = await serperSearch(company.name, company.website, platform, serperKey);
        if (candidate) {
          await sleep(randomDelay());
          const verified = await verifyLinkedinMatch(candidate, company.website);
          url = verified ? candidate : null;
          if (!verified) {
            console.log(`[${i + 1}/${ranked.length}] ${company.name} ${platform} — rejected unverified match: ${candidate}`);
          }
        }
      }

      const { error: insertError } = await supabase.from("socials").insert({
        company_id: company.id,
        platform,
        url,
        status: url ? "found" : "not_found",
      });
      if (insertError) {
        console.error(`[${i + 1}/${ranked.length}] ${company.name} ${platform} — insert failed: ${insertError.message}`);
        continue;
      }

      if (url) {
        found++;
        console.log(`[${i + 1}/${ranked.length}] ${company.name} ${platform} — found: ${url}`);
      } else {
        notFound++;
        console.log(`[${i + 1}/${ranked.length}] ${company.name} ${platform} — not found`);
      }

      await sleep(randomDelay());
    }
  }

  console.log("\n=== Discovery summary ===");
  console.log(`Found: ${found}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Companies already fully covered (skipped): ${skipped}`);
}

main();
