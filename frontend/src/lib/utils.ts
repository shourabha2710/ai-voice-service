/**
 * Formats a long Microsoft voice name into a cleaner version.
 * Example: "Microsoft Jenny Online (Natural) - English (United States)" 
 * -> "Jenny (Natural) - English (United States)"
 */
export function formatVoiceName(friendlyName: string): string {
  if (!friendlyName) return "";
  
  return friendlyName
    .replace(/Microsoft\s+/g, "")
    .replace(/Online\s+/g, "")
    .replace(/\(Natural\)\s+/g, "(Natural) ")
    .trim();
}

/**
 * Gets the country flag from a locale string.
 */
export function getFlag(locale: string): string {
  const flags: Record<string, string> = {
    en: "🇺🇸",
    es: "🇪🇸",
    fr: "🇫🇷",
    de: "🇩🇪",
    pt: "🇧🇷",
    it: "🇮🇹",
    ja: "🇯🇵",
    ko: "🇰🇷",
    zh: "🇨🇳",
    ar: "🇸🇦",
    ru: "🇷🇺",
    hi: "🇮🇳",
    bn: "🇧🇩",
    ta: "🇮🇳",
    te: "🇮🇳",
    ml: "🇮🇳",
    kn: "🇮🇳",
    mr: "🇮🇳",
    gu: "🇮🇳",
    pa: "🇮🇳",
    tr: "🇹🇷",
    vi: "🇻🇳",
    th: "🇹🇭",
    id: "🇮🇩",
    nl: "🇳🇱",
    pl: "🇵🇱",
    sv: "🇸🇪",
    fi: "🇫🇮",
    da: "🇩🇰",
    no: "🇳🇴",
    cs: "🇨🇿",
    el: "🇬🇷",
    hu: "🇭🇺",
    ro: "🇷🇴",
    sk: "🇸🇰",
    uk: "🇺🇦",
    he: "🇮🇱",
    fa: "🇮🇷",
    ur: "🇵🇰",
  };
  
  const prefix = Object.keys(flags).find((k) => locale.startsWith(k));
  return prefix ? flags[prefix] : "🌐";
}
