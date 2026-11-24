/**
 * Display names and the keys rows are grouped by.
 * cleanName is what the UI shows. nameKey is the same text in lowercase,
 * so "Led Zeppelin" and "led zeppelin" land in one group.
 * Neither function decides whether a row is kept.
 */

/**
 * Cleans a name for display.
 * Input is a raw Spotify string. Unicode is composed (NFC), the ends are
 * trimmed, and each run of whitespace becomes one space. Casing is kept.
 * Returns "" when the input is only whitespace.
 */
export function cleanName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

/**
 * Builds the grouping key for a name.
 * Input is a raw Spotify string. The result is cleanName in lowercase,
 * so spacing and accents compare the same and casing does not.
 */
export function nameKey(value: string): string {
  return cleanName(value).toLowerCase();
}
