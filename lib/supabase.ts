import { createClient } from "@supabase/supabase-js";

// Server-side client (API routes, scripts). Uses the service-role key —
// never import this in client components.
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
