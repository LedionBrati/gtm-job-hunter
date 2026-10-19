/**
 * Prints the exact prompt that would be sent to Claude for a given company,
 * without calling the API. Free, needs no OPENAI_API_KEY, and is the fastest
 * way to iterate on wording in lib/outreach-prompt.ts.
 *
 *   npm run preview:prompt                 # top-ranked company
 *   npm run preview:prompt -- <company-id>
 */
import dotenv from "dotenv";
import { getCompany, getRankedCompanies } from "../lib/queries";
import {
  buildSystemPrompt,
  buildUserPrompt,
  pickChannel,
  SF_WINDOW,
} from "../lib/outreach-prompt";

// Matches the other scripts: env lives in .env.local, not .env.
dotenv.config({ path: ".env.local" });

async function main() {
  const id = process.argv[2];

  const company = id
    ? await getCompany(id)
    : (await getRankedCompanies()).find((c) => c.contacts.length > 0) ?? null;

  if (!company) {
    console.error(id ? `No company with id ${id}` : "No company with contacts found.");
    process.exit(1);
  }

  const contact =
    company.contacts.find((c) => c.is_founder) ?? company.contacts[0] ?? null;
  if (!contact) {
    console.error(`${company.name} has no contacts to write to.`);
    process.exit(1);
  }

  const channel = pickChannel(contact);

  console.log(`\n=== ${company.name} → ${contact.name} (${channel}) ===`);
  console.log(
    SF_WINDOW
      ? `SF_WINDOW is set: "${SF_WINDOW}" — drafts will claim he is in SF then.`
      : `SF_WINDOW is empty — drafts will ask for a call and make no location claim.`
  );

  console.log("\n----- SYSTEM -----\n");
  console.log(buildSystemPrompt(channel));
  console.log("\n----- USER -----\n");
  console.log(buildUserPrompt(company, contact));
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
