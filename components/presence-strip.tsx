import type { Social, SocialStatus } from "@/lib/queries";
import { PLATFORM_ABBR, platformName } from "@/lib/platform-relevance";

type Presence = SocialStatus | "missing";

// A four-step ramp in a single hue, from void to solid. Absence is a hollow
// ring in a colour barely above the background — the same "outlined
// transparent" trick the site uses for its ghost numerals — so a company
// with nothing reads as literally perforated.
const RING: Record<Presence, string> = {
  missing: "border-void",
  not_found: "border-void",
  found: "border-accent",
  dead: "border-accent bg-accent-dim",
  active: "border-accent bg-accent",
};

function describe(platform: string, social: Social | undefined): string {
  const name = platformName(platform);
  if (!social || social.status === "not_found") return `${name}: no account found`;
  const followers =
    social.followers !== null ? `${social.followers.toLocaleString()} followers` : "followers unknown";
  if (social.status === "found") return `${name}: found, not yet enriched (${followers})`;
  if (social.status === "dead") return `${name}: inactive 60+ days (${followers})`;
  return `${name}: active (${followers})`;
}

export function PresenceStrip({
  platforms,
  socials,
  size = "sm",
}: {
  platforms: string[];
  socials: Social[];
  size?: "sm" | "lg";
}) {
  const dot = size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2";

  return (
    <div className="flex items-center gap-3">
      {platforms.map((platform) => {
        const social = socials.find((s) => s.platform === platform);
        const status: Presence = social ? social.status : "missing";
        return (
          <span
            key={platform}
            className="flex items-center gap-1.5"
            title={describe(platform, social)}
          >
            <span className="text-[0.55rem] uppercase tracking-[0.1em] text-muted">
              {PLATFORM_ABBR[platform] ?? platform}
            </span>
            <span
              className={`${dot} rounded-full border ${RING[status]}`}
              aria-hidden="true"
            />
            <span className="sr-only">{describe(platform, social)}</span>
          </span>
        );
      })}
    </div>
  );
}

export function PresenceLegend() {
  const items: [Presence, string][] = [
    ["not_found", "nothing there"],
    ["found", "found, unenriched"],
    ["dead", "inactive 60+ days"],
    ["active", "active"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-5">
      {items.map(([status, text]) => (
        <span key={status} className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full border ${RING[status]}`} />
          <span className="label-muted">{text}</span>
        </span>
      ))}
    </div>
  );
}
