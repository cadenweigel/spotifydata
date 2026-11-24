/**
 * Coarse platform labels stored on each stream.
 * Rules are checked from top to bottom and the first match wins.
 * Android is before TV so "Android TV" stays Android. Matching ignores case.
 */

/** How long an unmatched platform string is allowed to be. */
const FALLBACK_LENGTH = 40;

/**
 * Ordered pairs of pattern and label. The first pattern that matches is used.
 * Browser names sit above cast and TV, and Android sits above TV.
 */
const PLATFORM_RULES: readonly (readonly [RegExp, string])[] = [
  [/ios|iphone|ipad/i, "iOS"],
  [/android/i, "Android"],
  [/windows/i, "Windows"],
  [/os x|mac/i, "macOS"],
  [/web|chrome|firefox|safari|edge|opera/i, "Web Player"],
  [/cast|tv|playstation|xbox/i, "Other device"],
];

/**
 * Buckets one Spotify platform string.
 * Input is the raw `platform` field, which may be missing or blank.
 * Returns iOS, Android, Windows, macOS, Web Player, or Other device.
 * A string that matches nothing is cut to 40 characters. Missing or blank is null.
 */
export function bucketPlatform(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const platform = value.trim();
  if (platform === "") return null;

  for (const [pattern, label] of PLATFORM_RULES) {
    if (pattern.test(platform)) return label;
  }
  return platform.slice(0, FALLBACK_LENGTH);
}
