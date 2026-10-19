import type { Company, Contact, Reason } from "./queries";

/**
 * ⚠️ SET THIS BEFORE DRAFTING ANYTHING YOU'D ACTUALLY SEND.
 *
 * The drafts state this to founders as fact, so a stale window is a false claim
 * in a real message. The YC Startup School trip ran Jul 15–30 2026 and is over;
 * write the *next* window here in natural language, exactly as it should read
 * inside a sentence — e.g. "in SF from the 12th to the 20th of October".
 *
 * Left empty, the prompt drops the geography claim entirely and asks for a
 * short video call instead. That is the safe default, not a broken state.
 */
export const SF_WINDOW = "";

/** Which contact channel the message is written for. */
export type Channel = "email" | "linkedin";

export function pickChannel(contact: Contact): Channel {
  return contact.email ? "email" : "linkedin";
}

/**
 * Ledi's side of the pitch. Kept here rather than in the system prompt string
 * so it is one obvious place to edit as his situation changes.
 */
const BACKGROUND = `
- Economics student at AUEB (Athens University of Economics and Business), Greece.
- Runs a small AI agency; has shipped growth and content work for real clients.
- Went through YC Startup School in San Francisco.
- Targeting GTM / growth / founding-sales roles at early-stage startups.
- Built the tool that found this company: it imports recent YC batches, checks
  every founder's company across LinkedIn, X, Instagram and TikTok, and ranks
  them by how big the social-presence gap is.
`.trim();

const CHANNEL_RULES: Record<Channel, string> = {
  email: `Channel: cold email. Open with the observation, not a greeting-plus-throat-clearing. No subject line — the body only.`,
  linkedin: `Channel: LinkedIn connection note / DM. Even shorter than email: aim for 60-90 words. No links.`,
};

/**
 * "<Platform> account found but not yet enriched" means our pipeline knows the
 * account exists but never measured it — X and Instagram need a paid Apify
 * plan, so those rows stay unmeasured permanently. That is a fact about our
 * tooling, not about the founder, and it is not evidence of a gap. It must
 * never reach the model: quoted back, it produces drafts telling a founder
 * their account "hasn't been enriched", which is meaningless to them.
 */
function isMeasured(reason: Reason): boolean {
  return !/not yet enriched/i.test(reason.evidence);
}

function evidenceLines(reasons: Reason[]): string {
  const gaps = reasons
    .filter((r) => r.criterion.startsWith("presence_gap_"))
    .filter(isMeasured);
  const fit = reasons.filter((r) => !r.criterion.startsWith("presence_gap_"));
  const render = (rs: Reason[]) =>
    rs.length > 0 ? rs.map((r) => `- ${r.evidence}`).join("\n") : "- (none recorded)";

  const gapBlock =
    gaps.length > 0
      ? render(gaps)
      : "- (nothing confirmed — do NOT claim they are missing anything)";

  return `What the checker found (quote from these, invent nothing):\n${gapBlock}\n\nWhy they're a good fit for me:\n${render(fit)}`;
}

export function buildSystemPrompt(channel: Channel): string {
  const ask = SF_WINDOW
    ? `Ask for one specific thing: a coffee or a short call while he is ${SF_WINDOW}.`
    : `Ask for one specific thing: a 15-minute call. Do NOT claim he is in San Francisco or anywhere near them — that window is not set, so any geography claim would be false.`;

  return `You write cold outreach for Ledi Brati. You are drafting one message he will read, edit, and send by hand. Write only the message.

Ledi's background:
${BACKGROUND}

${CHANNEL_RULES[channel]}

The pitch: the founder's company has a weak or missing social presence, and Ledi does GTM and growth. The detected gap IS the opening — lead with it.

Rules:
- Under 120 words. Shorter is better.
- Name the specific gap with the specific evidence you were given. "I noticed you don't have a LinkedIn page and your last post on X was in March" — not "I noticed your social presence could be stronger."
- Never invent a fact. If the evidence says an account was not found, say it was not found. Do not guess follower counts, dates, or anything about their product beyond the one-liner you were given.
- ${ask}
- Casual and direct, like a message between two people. Contractions are fine.
- No flattery openers ("Love what you're building", "Huge fan of"), no "I hope this finds you well", no "I wanted to reach out", no em-dashes, no emoji, no bullet points, no sign-off block. One or two short paragraphs.
- Do not oversell. He is a student with an agency, not an agency with a team.
- Sign off with just "Ledi" or nothing at all.

Output the message text and nothing else — no preamble, no subject line, no notes, no quotation marks around it.`;
}

export function buildUserPrompt(company: Company, contact: Contact): string {
  const score = company.score;
  const facts = [
    `Company: ${company.name}`,
    company.one_liner ? `What they do: ${company.one_liner}` : null,
    company.yc_batch ? `YC batch: ${company.yc_batch}` : null,
    company.industry ? `Industry: ${company.industry}` : null,
    company.team_size !== null ? `Team size: ${company.team_size}` : null,
    company.location ? `Location: ${company.location}` : null,
    company.is_hiring ? `They are currently hiring.` : null,
    `Founder to write to: ${contact.name}${contact.role ? ` (${contact.role})` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${facts}

${evidenceLines(score?.reasons ?? [])}

Write the message to ${contact.name.split(" ")[0]}.`;
}
