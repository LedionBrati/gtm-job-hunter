// The score's visual weight still tracks its value — strong targets pull the
// eye, weak ones recede — but it does that with fill colour, not with an
// outline.
//
// The original used the site's ghost numeral for anything under 80:
// `color: transparent` over a 1px stroke. At hero size behind a headline that
// device is gorgeous. At 30px in a list column it stops being a dim number and
// becomes a hairline drawing of a number — the strokes are thinner than the
// text around it, so the digit you most need to read is the least legible mark
// on the row. Ledi's report was exactly this: the numbers weren't clear.
//
// So: a three-step solid ramp instead. Amber → off-white → warm grey. Same
// hierarchy, same one-glance scan, every digit actually readable. The ghost
// outline is still used where it belongs — the giant `GAPS` word behind the
// hero, which nobody has to read.
export function ScoreMark({
  value,
  size = "md",
}: {
  value: number | null;
  size?: "md" | "lg";
}) {
  // Mono, not Syne: these are figures in a column that should align digit-for
  // -digit down 531 rows, and Syne extrabold at -0.04em set "90" tight enough
  // that the two glyphs merged at small sizes.
  const dims =
    size === "lg"
      ? "text-[3.5rem] leading-none"
      : "text-[1.75rem] leading-none";

  if (value === null) {
    return (
      <span
        className={`font-mono font-bold ${dims} text-muted`}
        title="Not yet scored"
      >
        —
      </span>
    );
  }

  // #6f6a62 is 3.7:1 on --bg. Below the 4.5:1 body-text floor, but these are
  // 28px bold figures, which AA scores against the 3:1 large-text floor.
  const tone =
    value >= 80
      ? "text-accent"
      : value >= 65
        ? "text-[#d8d2c6]"
        : "text-[#6f6a62]";

  return (
    <span
      className={`font-mono font-bold tabular-nums tracking-[-0.02em] ${dims} ${tone}`}
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
      className={`border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.08em] ${
        warm
          ? "border-accent bg-accent-dim text-accent"
          : "border-hair text-dim"
      }`}
    >
      {STAGE_LABEL[effective] ?? effective}
    </span>
  );
}
