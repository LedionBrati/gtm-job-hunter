import dotenv from "dotenv";
import { supabaseAdmin } from "../lib/supabase";
import { relevantPlatforms } from "../lib/platform-relevance";
import { pca2 } from "../lib/pca";

dotenv.config({ path: ".env.local" });

interface SocialRow {
  platform: string;
  status: string;
  followers: number | null;
  last_post_at: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  industry: string | null;
  is_hiring: boolean;
  team_size: number | null;
  yc_batch: string;
  socials: SocialRow[];
}

interface Reason {
  criterion: string;
  points: number;
  evidence: string;
}

// Per-platform gap contribution, 0 (no gap) to 1 (max gap), plus the
// evidence sentence explaining why. Followers are log-scaled since raw
// counts are heavily right-skewed; a flat cap of 5,000 followers reaches
// "full reach" for a young YC-stage company's social presence.
function platformGap(social: SocialRow | undefined, platform: string): { gap: number; evidence: string } {
  if (!social || social.status === "not_found") {
    return { gap: 1, evidence: `No ${platform} account found` };
  }
  if (social.status === "found") {
    // URL known but not enriched (Instagram/X, or LinkedIn's activity-blind actor)
    return { gap: 0.6, evidence: `${platform} account found but not yet enriched (followers/activity unknown)` };
  }

  const followers = social.followers ?? 0;
  const reach = Math.min(Math.log(1 + followers) / Math.log(1 + 5000), 1);
  const staleness =
    social.status === "dead"
      ? 1
      : social.last_post_at
        ? Math.min((Date.now() - new Date(social.last_post_at).getTime()) / (1000 * 60 * 60 * 24 * 60), 1)
        : 0.5;

  const gap = 0.5 * staleness + 0.5 * (1 - reach);
  const staleDesc =
    social.status === "dead"
      ? "inactive (no post in 60+ days)"
      : social.last_post_at
        ? `last posted ${Math.round((Date.now() - new Date(social.last_post_at).getTime()) / (1000 * 60 * 60 * 24))} days ago`
        : "activity unknown";
  return {
    gap,
    evidence: `${platform}: ${followers} followers, ${staleDesc}`,
  };
}

function computePresenceGap(company: CompanyRow): { score: number; reasons: Reason[] } {
  const platforms = relevantPlatforms(company.industry);
  const reasons: Reason[] = [];
  let total = 0;

  for (const platform of platforms) {
    const social = company.socials.find((s) => s.platform === platform);
    const { gap, evidence } = platformGap(social, platform);
    total += gap;
    reasons.push({ criterion: `presence_gap_${platform}`, points: Math.round(gap * 100), evidence });
  }

  const score = platforms.length > 0 ? Math.round((total / platforms.length) * 100) : 0;
  return { score, reasons };
}

function computeFit(company: CompanyRow): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let score = 0;

  if (company.is_hiring) {
    score += 30;
    reasons.push({ criterion: "is_hiring", points: 30, evidence: "Company is actively hiring" });
  }

  if (company.team_size !== null && company.team_size >= 3 && company.team_size <= 20) {
    score += 40;
    reasons.push({
      criterion: "team_size_fit",
      points: 40,
      evidence: `Team size ${company.team_size} is in the ideal 3-20 range (big enough to need help, small enough to lack a marketer)`,
    });
  }

  const batchPoints = company.yc_batch === "W26" ? 30 : 20;
  score += batchPoints;
  reasons.push({ criterion: "batch_recency", points: batchPoints, evidence: `${company.yc_batch} batch` });

  return { score, reasons };
}

async function main() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, industry, is_hiring, team_size, yc_batch, socials(platform, status, followers, last_post_at)");
  if (error) throw error;

  const companies = data as unknown as CompanyRow[];

  const computed = companies.map((company) => {
    const presence = computePresenceGap(company);
    const fit = computeFit(company);
    return { company, presence, fit };
  });

  const { weights, explainedVarianceRatio } = pca2(
    computed.map((c) => [c.presence.score, c.fit.score] as [number, number])
  );
  const [wGap, wFit] = weights;

  console.log(`PCA weights — presence_gap: ${wGap.toFixed(3)}, fit: ${wFit.toFixed(3)} (explained variance: ${(explainedVarianceRatio * 100).toFixed(1)}%)`);

  let written = 0;
  for (const [i, { company, presence, fit }] of computed.entries()) {
    const totalScore = Math.round(wGap * presence.score + wFit * fit.score);
    const reasons = [...presence.reasons, ...fit.reasons];

    const { error: upsertError } = await supabase.from("scores").insert({
      company_id: company.id,
      presence_gap_score: presence.score,
      fit_score: fit.score,
      total_score: totalScore,
      reasons,
    });
    if (upsertError) {
      console.error(`[${i + 1}/${computed.length}] ${company.name} — FAILED: ${upsertError.message}`);
      continue;
    }
    written++;
    console.log(`[${i + 1}/${computed.length}] ${company.name} — gap=${presence.score} fit=${fit.score} total=${totalScore}`);
  }

  console.log(`\n=== Scoring summary ===`);
  console.log(`Scores written: ${written}`);
  console.log(`PCA weights: presence_gap=${wGap.toFixed(3)}, fit=${wFit.toFixed(3)}`);
}

main();
