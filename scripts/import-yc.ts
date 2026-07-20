import dotenv from "dotenv";
import { decode } from "he";
import { supabaseAdmin } from "../lib/supabase";

dotenv.config({ path: ".env.local" });

// Edit this list to re-run the importer for new batches.
const BATCHES: { slug: string; code: string }[] = [
  { slug: "winter-2025", code: "W25" },
  { slug: "summer-2025", code: "S25" },
  { slug: "winter-2026", code: "W26" },
];

const YC_OSS_BASE = "https://yc-oss.github.io/api/batches";

interface YcOssCompany {
  id: number;
  name: string;
  slug: string;
  website: string;
  one_liner: string;
  team_size: number | null;
  industry: string | null;
  all_locations: string | null;
  isHiring: boolean;
  url: string;
}

interface YcFounder {
  full_name: string;
  title: string;
  linkedin_url: string | null;
  twitter_url: string | null;
}

interface YcProfileCompany {
  linkedin_url: string | null;
  twitter_url: string | null;
  github_url: string | null;
  founders: YcFounder[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return 400 + Math.random() * 400;
}

async function fetchProfileCompany(url: string): Promise<YcProfileCompany | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; gtm-job-hunter-import/1.0)" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) return null;
  const decoded = decode(match[1]);
  const parsed = JSON.parse(decoded);
  return parsed?.props?.company ?? null;
}

async function main() {
  const supabase = supabaseAdmin();
  let companiesUpserted = 0;
  let foundersAdded = 0;
  let socialsAdded = 0;
  const failures: string[] = [];

  for (const batch of BATCHES) {
    console.log(`\n=== Batch ${batch.code} (${batch.slug}) ===`);
    const res = await fetch(`${YC_OSS_BASE}/${batch.slug}.json`);
    if (!res.ok) {
      console.error(`Failed to fetch batch list for ${batch.slug}: ${res.status}`);
      continue;
    }
    const companies: YcOssCompany[] = await res.json();
    console.log(`${companies.length} companies in ${batch.code}`);

    for (const [i, company] of companies.entries()) {
      const progress = `[${batch.code} ${i + 1}/${companies.length}]`;
      try {
        const { data: companyRow, error: companyError } = await supabase
          .from("companies")
          .upsert(
            {
              name: company.name,
              website: company.website || null,
              yc_batch: batch.code,
              one_liner: company.one_liner || null,
              industry: company.industry || null,
              team_size: company.team_size,
              location: company.all_locations || null,
              is_hiring: company.isHiring,
              yc_url: company.url,
              yc_slug: company.slug,
            },
            { onConflict: "yc_slug" }
          )
          .select("id")
          .single();

        if (companyError) throw companyError;
        companiesUpserted++;

        await sleep(randomDelay());
        const profile = await fetchProfileCompany(company.url);
        if (!profile) {
          console.log(`${progress} ${company.name} — profile page unavailable, skipped enrichment`);
          continue;
        }

        for (const founder of profile.founders ?? []) {
          const { data: existing } = await supabase
            .from("contacts")
            .select("id")
            .eq("company_id", companyRow.id)
            .eq("name", founder.full_name)
            .maybeSingle();

          if (!existing) {
            const { error: contactError } = await supabase.from("contacts").insert({
              company_id: companyRow.id,
              name: founder.full_name,
              role: founder.title || null,
              is_founder: true,
              linkedin_url: founder.linkedin_url || null,
            });
            if (contactError) throw contactError;
            foundersAdded++;
          }
        }

        const companySocials: { platform: string; url: string | null }[] = [
          { platform: "linkedin", url: profile.linkedin_url },
          { platform: "x", url: profile.twitter_url },
          { platform: "github", url: profile.github_url },
        ];

        for (const social of companySocials) {
          if (!social.url) continue;
          const { data: existing } = await supabase
            .from("socials")
            .select("id")
            .eq("company_id", companyRow.id)
            .eq("platform", social.platform)
            .maybeSingle();

          if (!existing) {
            const { error: socialError } = await supabase.from("socials").insert({
              company_id: companyRow.id,
              platform: social.platform,
              url: social.url,
              status: "found",
            });
            if (socialError) throw socialError;
            socialsAdded++;
          }
        }

        console.log(`${progress} ${company.name} — ok`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${progress} ${company.name} — FAILED: ${message}`);
        failures.push(`${company.name} (${batch.code}): ${message}`);
      }
    }
  }

  console.log("\n=== Import summary ===");
  console.log(`Companies upserted: ${companiesUpserted}`);
  console.log(`Founders added: ${foundersAdded}`);
  console.log(`Socials added: ${socialsAdded}`);
  console.log(`Failures: ${failures.length}`);
  if (failures.length > 0) {
    console.log(failures.join("\n"));
  }
}

main();
