import OpenAI from "openai";
import type { Company, Contact } from "./queries";
import { buildSystemPrompt, buildUserPrompt, pickChannel } from "./outreach-prompt";

/**
 * The drafting call. Everything about WHAT to say lives in outreach-prompt.ts,
 * which is provider-agnostic — this file is only the wire call, so swapping
 * providers again means rewriting this file and nothing else.
 *
 * Override the model with OPENAI_MODEL without touching code.
 */
const DEFAULT_MODEL = "gpt-5.2";

export async function draftOutreachMessage(
  company: Company,
  contact: Contact
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No OPENAI_API_KEY configured. Add it to .env.local (and `vercel env add` for Production)."
    );
  }

  const channel = pickChannel(contact);
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  let response;
  try {
    response = await client.responses.create({
      model,
      instructions: buildSystemPrompt(channel),
      input: buildUserPrompt(company, contact),
      // The message is ~120 words; the ceiling is generous so a reasoning
      // model's internal tokens cannot squeeze out the actual answer.
      max_output_tokens: 4000,
    });
  } catch (err) {
    // Surface the provider's own message — an unknown model or an unfunded
    // account both fail here, and the difference matters to whoever reads it.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`OpenAI request failed (model "${model}"): ${message}`);
  }

  const text = response.output_text?.trim();
  if (!text) {
    // incomplete = hit the token ceiling before finishing the message.
    if (response.status === "incomplete") {
      throw new Error(
        `Draft was cut off (${response.incomplete_details?.reason ?? "unknown reason"}). Try again.`
      );
    }
    throw new Error("The model returned an empty draft. Try again.");
  }
  return text;
}
