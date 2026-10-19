/**
 * Dumps every table to timestamped JSON in ./backups (gitignored).
 *
 *   npm run backup
 *
 * This is a restore point to run BEFORE each schema migration, not a substitute
 * for Supabase's own snapshots — it captures rows, not schema, policies or
 * sequences. Take the dashboard snapshot too.
 *
 * ⚠️ The output contains 1000+ real founders' names, emails and LinkedIn URLs.
 * ./backups is gitignored and must stay that way. Don't sync it anywhere.
 */
import dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "../lib/supabase";

dotenv.config({ path: ".env.local" });

const TABLES = [
  "companies",
  "socials",
  "contacts",
  "contact_socials",
  "scores",
  "outreach",
];

// PostgREST silently caps unbounded selects at 1000 rows, so page explicitly.
// scores is the big one — it is insert-only and grows every scoring run.
const PAGE = 1000;

async function dumpTable(
  supabase: ReturnType<typeof supabaseAdmin>,
  table: string
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const supabase = supabaseAdmin();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "backups", stamp);
  mkdirSync(dir, { recursive: true });

  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = await dumpTable(supabase, table);
    writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
    counts[table] = rows.length;
    console.log(`${table.padEnd(16)} ${rows.length}`);
  }

  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ takenAt: new Date().toISOString(), counts }, null, 2)
  );
  console.log(`\nWrote ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
