// Which social platforms are worth checking for a company, based on its
// YC industry tag. Checking a B2B infra startup's TikTok is wasted spend
// and a meaningless "gap" — that audience was never going to be there.
// Grounded in the real industry breakdown of the imported companies:
// B2B 347, Industrials 59, Healthcare 40, Fintech 38, Consumer 26,
// Real Estate and Construction 9, Education 7, Government 5.
const INDUSTRY_PLATFORMS: Record<string, string[]> = {
  Consumer: ["linkedin", "x", "instagram", "tiktok"],
  Healthcare: ["linkedin", "x", "instagram"],
  Education: ["linkedin", "x", "instagram"],
};

const DEFAULT_PLATFORMS = ["linkedin", "x"];

export function relevantPlatforms(industry: string | null): string[] {
  if (!industry) return DEFAULT_PLATFORMS;
  return INDUSTRY_PLATFORMS[industry] ?? DEFAULT_PLATFORMS;
}

// Human-facing platform names. Evidence strings are read by people (the
// dashboard) and by Claude (Part 5's outreach drafts), so raw keys like "x"
// or "linkedin" must never reach prose.
export const PLATFORM_DISPLAY: Record<string, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  github: "GitHub",
};

/** Two-letter form for dense UI (the presence strip). */
export const PLATFORM_ABBR: Record<string, string> = {
  linkedin: "LI",
  x: "X",
  instagram: "IG",
  tiktok: "TT",
  github: "GH",
};

export function platformName(platform: string): string {
  return PLATFORM_DISPLAY[platform] ?? platform;
}

export const PLATFORM_DOMAINS: Record<string, RegExp> = {
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/company\/([a-zA-Z0-9_-]+)/,
  x: /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]+)/,
};

// Generic (non-profile) path segments each platform uses in shared/embed
// links — without this, e.g. an embedded Reels widget (instagram.com/reel/…)
// on a company's homepage gets mistaken for their own profile.
const GENERIC_HANDLES: Record<string, Set<string>> = {
  x: new Set(["intent", "share", "hashtag", "search", "home"]),
  instagram: new Set(["reel", "reels", "p", "explore", "accounts", "stories", "tv", "direct", "about", "developer"]),
  linkedin: new Set(),
  tiktok: new Set(),
};

// Finds the first match in `html` that isn't a generic/shared link.
export function findPlatformUrl(html: string, platform: string): string | null {
  const regex = new RegExp(PLATFORM_DOMAINS[platform].source, "g");
  const generic = GENERIC_HANDLES[platform];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const handle = match[1]?.toLowerCase();
    if (!handle || !generic.has(handle)) {
      return match[0];
    }
  }
  return null;
}

export const PLATFORM_SEARCH_DOMAINS: Record<string, string> = {
  linkedin: "linkedin.com/company",
  x: "x.com",
  instagram: "instagram.com",
  tiktok: "tiktok.com",
};
