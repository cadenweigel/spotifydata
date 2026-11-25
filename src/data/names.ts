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
 * Plain ASCII that is already trimmed is returned as itself. That is the
 * same text, and grouping a long history does not pay for Unicode on it.
 */
export function cleanName(value: string): string {
  if (isPlainClean(value)) return value;
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

/**
 * True when cleanName would return the same string.
 * Printable ASCII with no leading, trailing, or repeated spaces needs no
 * Unicode normalization. Anything else, including accents, takes the full path.
 */
function isPlainClean(value: string): boolean {
  const length = value.length;
  let previousWasSpace = true;
  for (let index = 0; index < length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x20) {
      if (previousWasSpace) return false;
      previousWasSpace = true;
      continue;
    }
    if (code < 0x21 || code > 0x7e) return false;
    previousWasSpace = false;
  }
  return length === 0 || !previousWasSpace;
}

/**
 * Builds the grouping key for a name.
 * Input is a raw Spotify string. The result is cleanName in lowercase,
 * so spacing and accents compare the same and casing does not.
 */
export function nameKey(value: string): string {
  return cleanName(value).toLowerCase();
}
