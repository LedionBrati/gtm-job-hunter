import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, type Reason } from "@/lib/queries";
import { platformName } from "@/lib/platform-relevance";
import { PresenceStrip } from "@/components/presence-strip";
import { ScoreMark, StageChip } from "@/components/score-mark";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  return { title: company ? `${company.name} — Targets` : "Not found" };
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  const score = company.score;
  const gapReasons = (score?.reasons ?? []).filter((r) =>
    r.criterion.startsWith("presence_gap_")
  );
  const fitReasons = (score?.reasons ?? []).filter(
    (r) => !r.criterion.startsWith("presence_gap_")
  );

  const founders = company.contacts.filter((c) => c.is_founder);
  const others = company.contacts.filter((c) => !c.is_founder);
  const outreach = company.outreach[0] ?? null;

  return (
    <div className="relative overflow-hidden">
      <span
        className="ghost-word absolute -top-10 right-0 hidden text-[11rem] lg:block"
        aria-hidden="true"
      >
        {company.name.toUpperCase().slice(0, 12)}
      </span>

      <div className="relative mx-auto max-w-[1240px] px-6 pt-10">
        <Link href="/" className="label-muted underline-grow no-underline">
          ← Back to list
        </Link>

        <div className="mt-8 flex flex-wrap items-start gap-x-10 gap-y-6">
          <div className="flex flex-col items-start">
            <ScoreMark value={score?.total_score ?? null} size="lg" />
            <span className="label mt-2">total</span>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="headline">{company.name}</h1>
            {company.one_liner && (
              <p className="mt-4 max-w-[58ch] text-[1rem] leading-[1.7] text-dim">
                {company.one_liner}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {[
                company.yc_batch,
                company.industry,
                company.team_size !== null ? `${company.team_size} people` : null,
                company.location,
              ]
                .filter(Boolean)
                .map((bit) => (
                  <span key={bit as string} className="label-muted">
                    {bit}
                  </span>
                ))}
              {company.is_hiring && (
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-accent">
                  hiring
                </span>
              )}
              <StageChip stage={outreach?.stage ?? null} />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip"
                >
                  Website ↗
                </a>
              )}
              {company.yc_url && (
                <a
                  href={company.yc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip"
                >
                  YC profile ↗
                </a>
              )}
              {company.socials
                .filter((s) => s.url)
                .map((s) => (
                  <a
                    key={s.platform}
                    href={s.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip"
                  >
                    {platformName(s.platform)} ↗
                  </a>
                ))}
            </div>
          </div>
        </div>

        {/* Two sub-scores side by side, hairline-separated like the site's cards */}
        <div className="mt-14 grid gap-px bg-hair sm:grid-cols-2">
          <SubScore
            label="Presence gap"
            value={score?.presence_gap_score ?? null}
            weight="60% of total"
            reasons={gapReasons}
          />
          <SubScore
            label="Fit"
            value={score?.fit_score ?? null}
            weight="40% of total"
            reasons={fitReasons}
          />
        </div>

        {/* Per-platform raw evidence */}
        <section className="mt-14">
          <span className="label">Presence detail</span>
          <div className="mt-6">
            <PresenceStrip
              platforms={company.platforms}
              socials={company.socials}
              size="lg"
            />
          </div>
          <table className="mt-7 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hair">
                <Th>Platform</Th>
                <Th>Status</Th>
                <Th>Followers</Th>
                <Th>Last post</Th>
                <Th>Checked</Th>
              </tr>
            </thead>
            <tbody>
              {company.platforms.map((platform) => {
                const social = company.socials.find(
                  (s) => s.platform === platform
                );
                return (
                  <tr key={platform} className="border-b border-hair">
                    <Td>{platformName(platform)}</Td>
                    <Td accent={!social || social.status === "not_found"}>
                      {social ? social.status.replace("_", " ") : "not checked"}
                    </Td>
                    <Td>{social?.followers?.toLocaleString() ?? "—"}</Td>
                    <Td>{formatDate(social?.last_post_at)}</Td>
                    <Td>{formatDate(social?.checked_at)}</Td>
                  </tr>
                );
              })}
              {/* Platforms found but not judged relevant for this industry */}
              {company.socials
                .filter((s) => !company.platforms.includes(s.platform))
                .map((s) => (
                  <tr key={s.platform} className="border-b border-hair opacity-50">
                    <Td>
                      {platformName(s.platform)}{" "}
                      <span className="label-muted">not scored</span>
                    </Td>
                    <Td>{s.status.replace("_", " ")}</Td>
                    <Td>{s.followers?.toLocaleString() ?? "—"}</Td>
                    <Td>{formatDate(s.last_post_at)}</Td>
                    <Td>{formatDate(s.checked_at)}</Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        {/* Contacts */}
        <section className="mt-14">
          <span className="label">Who to message</span>
          {company.contacts.length === 0 ? (
            <p className="mt-6 text-[0.9rem] text-meta">
              No contacts captured for this company yet.
            </p>
          ) : (
            <ul className="mt-6">
              {[...founders, ...others].map((contact) => (
                <li
                  key={contact.id}
                  className="row-nudge flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-hair py-4 last:border-b"
                >
                  <span className="font-display text-[1rem] font-bold text-text">
                    {contact.name}
                  </span>
                  {contact.role && (
                    <span className="label-muted">{contact.role}</span>
                  )}
                  {contact.is_founder && (
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-accent">
                      founder
                    </span>
                  )}
                  <span className="ml-auto flex gap-4">
                    {contact.linkedin_url && (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[0.85rem] text-accent underline-grow no-underline"
                      >
                        LinkedIn ↗
                      </a>
                    )}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-[0.85rem] text-accent underline-grow no-underline"
                      >
                        {contact.email}
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-14 flex flex-wrap gap-4">
          <Link href={`/companies/${company.id}/edit`} className="btn btn-ghost">
            Edit company
          </Link>
        </div>

        {score && (
          <p className="mt-10 label-muted">
            Scored {formatDate(score.scored_at)}
          </p>
        )}
      </div>
    </div>
  );
}

function SubScore({
  label,
  value,
  weight,
  reasons,
}: {
  label: string;
  value: number | null;
  weight: string;
  reasons: Reason[];
}) {
  return (
    <div className="bg-card p-7">
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="label-muted">{weight}</span>
      </div>
      <div className="mt-4 font-display text-[2.6rem] font-extrabold leading-none tabular-nums text-text">
        {value ?? "—"}
        <span className="text-[1rem] text-muted"> / 100</span>
      </div>
      <ul className="mt-6 space-y-3">
        {reasons.map((reason) => (
          <li key={reason.criterion} className="flex gap-3">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span className="text-[0.9rem] leading-[1.65] text-dim">
              {reason.evidence}
              <span className="ml-2 font-mono text-[0.8rem] tabular-nums text-meta">
                +{reason.points}
              </span>
            </span>
          </li>
        ))}
        {reasons.length === 0 && (
          <li className="text-[0.9rem] text-meta">No evidence recorded.</li>
        )}
      </ul>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="label-muted py-3 pr-4 font-normal">{children}</th>;
}

function Td({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <td
      className={`py-3 pr-4 text-[0.875rem] ${accent ? "text-accent" : "text-dim"}`}
    >
      {children}
    </td>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}
