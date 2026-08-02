import Link from "next/link";
import { getRankedCompanies, getBatches, type Company } from "@/lib/queries";
import { platformName } from "@/lib/platform-relevance";
import { PresenceStrip, PresenceLegend } from "@/components/presence-strip";
import { ScoreMark, StageChip } from "@/components/score-mark";

// Always read live DB state — a stale ranking is worse than a slow one.
export const dynamic = "force-dynamic";

// The punchiest one-line version of why this company is a target. Confirmed
// absences are the strongest pitch material, so they lead; if nothing is
// outright missing, fall back to the weakest platform's evidence.
function gapSummary(company: Company): string {
  const reasons = company.score?.reasons ?? [];
  const gaps = reasons.filter((r) => r.criterion.startsWith("presence_gap_"));
  if (gaps.length === 0) return company.one_liner ?? "Not yet scored";

  const missing = gaps
    .filter((r) => /^No /i.test(r.evidence))
    .map((r) => r.criterion.replace("presence_gap_", ""))
    .map(platformName);

  if (missing.length > 0) return `no ${missing.join(" · no ")}`;

  const weakest = [...gaps].sort((a, b) => b.points - a.points)[0];
  return weakest.evidence.toLowerCase();
}

function parseFilters(params: Record<string, string | string[] | undefined>) {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const min = Number(one("min"));
  return {
    batch: one("batch") || undefined,
    hiring: one("hiring") === "1",
    minScore: Number.isFinite(min) && min > 0 ? min : undefined,
  };
}

export default async function RankedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const [companies, batches] = await Promise.all([
    getRankedCompanies(filters),
    getBatches(),
  ]);

  const zeroPresence = companies.filter((c) =>
    c.platforms.every((p) => {
      const social = c.socials.find((s) => s.platform === p);
      return !social || social.status === "not_found";
    })
  ).length;
  const hiring = companies.filter((c) => c.is_hiring).length;
  const filtered = Boolean(filters.batch || filters.hiring || filters.minScore);

  return (
    <div className="relative overflow-hidden">
      <span
        className="ghost-word absolute -top-6 right-0 hidden text-[13rem] lg:block"
        aria-hidden="true"
      >
        GAPS
      </span>

      <div className="relative mx-auto max-w-[1240px] px-6 pt-12">
        <span className="label">The list</span>
        <h1 className="headline mt-5 max-w-3xl">
          {companies.length} YC startups,
          <br />
          ranked by what they&apos;re <span className="ac">missing</span>.
        </h1>

        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat value={companies.length} label="in view" />
          <Stat value={zeroPresence} label="zero presence" />
          <Stat value={hiring} label="hiring" />
        </div>

        {/* Plain GET form: filters survive refresh and links, no client JS. */}
        <form className="mt-10 flex flex-wrap items-end gap-4 border-y border-hair py-5">
          <label className="flex flex-col gap-2">
            <span className="label-muted">Batch</span>
            <select
              name="batch"
              defaultValue={filters.batch ?? ""}
              className="field w-40"
            >
              <option value="">All batches</option>
              {batches.map(({ batch, count }) => (
                <option key={batch} value={batch}>
                  {batch} ({count})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="label-muted">Min score</span>
            <select
              name="min"
              defaultValue={String(filters.minScore ?? "")}
              className="field w-36"
            >
              <option value="">Any</option>
              <option value="60">60+</option>
              <option value="70">70+</option>
              <option value="80">80+</option>
              <option value="85">85+</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 pb-2.5">
            <input
              type="checkbox"
              name="hiring"
              value="1"
              defaultChecked={filters.hiring}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            <span className="label-muted">Hiring only</span>
          </label>

          <button type="submit" className="btn mb-1">
            Apply
          </button>
          {filtered && (
            <Link href="/" className="btn btn-ghost mb-1">
              Reset
            </Link>
          )}
        </form>

        <div className="mt-5">
          <PresenceLegend />
        </div>
      </div>

      <ol className="relative mx-auto mt-8 max-w-[1240px]">
        {companies.map((company, i) => (
          <li key={company.id} className="border-t border-hair last:border-b">
            <Link
              href={`/company/${company.id}`}
              className="row-nudge grid grid-cols-[3.25rem_1fr] items-start gap-x-4 px-6 py-3.5 no-underline sm:grid-cols-[3.25rem_1fr_auto]"
            >
              <div className="flex flex-col items-start pt-0.5">
                <ScoreMark value={company.score?.total_score ?? null} />
                {/* Deliberately quieter than the score. Two numbers stacked in
                    one 3.25rem column will be confused for each other unless
                    one of them clearly loses. */}
                <span className="mt-1 font-mono text-[0.62rem] tracking-[0.1em] text-[#5f5f5f]">
                  #{i + 1}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-display text-[1.05rem] font-bold tracking-[-0.01em] text-text">
                    {company.name}
                  </h2>
                  <span className="label-muted">
                    {[
                      company.yc_batch,
                      company.team_size !== null
                        ? `${company.team_size} people`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {company.is_hiring && (
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-accent">
                      hiring
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <PresenceStrip
                    platforms={company.platforms}
                    socials={company.socials}
                  />
                  {/* The actual reason to care about this row — it was the
                      smallest, faintest text on the page. Now the opposite. */}
                  <span className="truncate text-[0.875rem] text-dim">
                    {gapSummary(company)}
                  </span>
                </div>
              </div>

              <div className="hidden pt-1.5 sm:block">
                <StageChip stage={company.outreach[0]?.stage ?? null} />
              </div>
            </Link>
          </li>
        ))}
      </ol>

      {companies.length === 0 && (
        <p className="mx-auto max-w-[1240px] px-6 py-16 text-[0.9rem] text-dim">
          Nothing matches those filters.{" "}
          <Link href="/" className="text-accent underline-grow no-underline">
            Clear them
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-display text-[1.35rem] font-extrabold tabular-nums text-text">
        {value}
      </span>
      <span className="label-muted">{label}</span>
    </span>
  );
}
