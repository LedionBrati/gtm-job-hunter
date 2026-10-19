import dotenv from "dotenv";
import { supabaseAdmin } from "../lib/supabase";
import { relevantPlatforms, platformName } from "../lib/platform-relevance";

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

// How presence_gap_score and fit_score combine into total_score.
//
// These were briefly derived via PCA (first principal component of the two
// scores) to avoid asserting a split by hand. That was the wrong tool:
//   - The two scores are mildly NEGATIVELY correlated across the dataset
//     (r ~= -0.13), so the max-variance direction is the "seesaw" axis and
//     the eigenvector comes out with mixed signs — fit landed at -0.998,
//     which ranked well-fitting companies LAST.
//   - Even sign-corrected, PCA on two standardized variables is always
//     exactly 50/50 regardless of correlation, and on raw (unstandardized)
//     scores it just mirrors how wide each score's point scheme happens to
//     be (fit's variance is ~6x the gap's purely by construction).
// So PCA cannot express a preference between exactly two inputs — the
// preference has to be a judgement call. The detected presence gap IS the
// pitch, so it carries the larger share.
const GAP_WEIGHT = 0.6;
const FIT_WEIGHT = 0.4;

// Per-platform gap contribution, 0 (no gap) to 1 (max gap), plus the
// evidence sentence explaining why. Followers are log-scaled since raw
// counts are heavily right-skewed; a flat cap of 5,000 followers reaches
// "full reach" for a young YC-stage company's social presence.
function platformGap(social: SocialRow | undefined, platform: string): { gap: number; evidence: string } {
  const name = platformName(platform);
  if (!social || social.status === "not_found") {
    return { gap: 1, evidence: `No ${name} account found` };
  }
  // Genuinely unmeasured: the account exists but nothing was ever read off it.
  // This is the permanent state for X and Instagram, whose Apify actors need a
  // paid plan. Branch on `followers`, NOT on status alone: the LinkedIn actor
  // returns follower counts but no posting activity, so an enriched LinkedIn
  // row keeps status "found" forever. Checking status first (as this did)
  // threw away every follower count we paid to collect and scored 455
  // measured rows as if they were unknown.
  if (social.followers === null) {
    return { gap: 0.6, evidence: `${name} account found but not yet measured` };
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
    evidence: `${name}: ${followers} followers, ${staleDesc}`,
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

  console.log(`Weights — presence_gap: ${GAP_WEIGHT}, fit: ${FIT_WEIGHT}`);

  let written = 0;
  for (const [i, { company, presence, fit }] of computed.entries()) {
    const totalScore = Math.round(GAP_WEIGHT * presence.score + FIT_WEIGHT * fit.score);
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
  console.log(`Weights: presence_gap=${GAP_WEIGHT}, fit=${FIT_WEIGHT}`);
}

main();
