// The score's visual weight tracks its value, reusing the site's ghost
// numeral: weak targets are outlined and recede into the page, strong ones
// are solid amber. Scanning the list, the eye is pulled to the 80s and 90s
// without needing a colour scale.
export function ScoreMark({
  value,
  size = "md",
}: {
  value: number | null;
  size?: "md" | "lg";
}) {
  const dims =
    size === "lg"
      ? "text-[3.75rem] leading-none"
      : "text-[1.9rem] leading-none";

  if (value === null) {
    return (
      <span
        className={`font-display font-extrabold ${dims} text-muted`}
        title="Not yet scored"
      >
        —
      </span>
    );
  }

  const strong = value >= 80;
  const mid = value >= 65 && value < 80;

  const style = strong
    ? { color: "var(--accent)" }
    : mid
      ? { color: "var(--text)" }
      : {
          color: "transparent",
          WebkitTextStroke: "1px var(--text-muted)",
        };

  return (
    <span
      className={`font-display font-extrabold tabular-nums tracking-[-0.04em] ${dims}`}
      style={style}
    >
      {value}
    </span>
  );
}

const STAGE_LABEL: Record<string, string> = {
  not_started: "—",
  drafted: "drafted",
  sent: "sent",
  replied: "replied",
  meeting: "meeting",
  dead: "dead",
};

/** Outreach stage as a hairline chip; only warms up once there's real activity. */
export function StageChip({ stage }: { stage: string | null }) {
  const effective = stage ?? "not_started";
  if (effective === "not_started") {
    return <span className="label-muted">—</span>;
  }
  const warm = effective === "replied" || effective === "meeting";
  return (
    <span
      className={`border px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.14em] ${
        warm
          ? "border-accent bg-accent-dim text-accent"
          : "border-hair text-dim"
      }`}
    >
      {STAGE_LABEL[effective] ?? effective}
    </span>
  );
}
