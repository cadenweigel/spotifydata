/**
 * The UI preferences in localStorage. The listening history is not stored here.
 * readPrefs validates each field and falls back one field at a time.
 * writePrefs replaces the object and keeps any keys this version does not use.
 */

export const PREFS_KEY = "spotifydata-prefs";

/** Longest custom threshold the controls will store: 24 hours. */
export const MAX_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const THRESHOLD_PRESETS = [
  { ms: 0, label: "All plays" },
  { ms: 30_000, label: "30 seconds or more" },
  { ms: 60_000, label: "60 seconds or more" },
] as const;

export type Prefs = {
  version: 1;
  /** Whole seconds, stored as milliseconds. 0 counts every play. */
  streamThresholdMs: number;
  includePodcasts: boolean;
};

export type PrefsPatch = Partial<Pick<Prefs, "streamThresholdMs" | "includePodcasts">>;

export type LoadedPrefs = {
  prefs: Prefs;
  /** Keys this version does not understand. Writes put them back. */
  extras: Record<string, unknown>;
  /** False when the stored version is newer. The provider must not overwrite it. */
  canWrite: boolean;
  /** True when a field was missing or invalid and a default replaced it. */
  changed: boolean;
};

const KNOWN_KEYS = new Set(["version", "streamThresholdMs", "includePodcasts"]);

/**
 * The preferences used when nothing valid is stored.
 * Input is none.
 * Returns a new object, so a caller can change it without changing the defaults.
 */
export function defaultPrefs(): Prefs {
  return { version: 1, streamThresholdMs: 30_000, includePodcasts: false };
}

/**
 * True when the number is a whole number of seconds inside the allowed range.
 * Input is the untrusted stored value.
 * 0 is allowed. Values above 24 hours, fractions, and non-numbers are not.
 */
export function isThresholdMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_THRESHOLD_MS &&
    value % 1000 === 0
  );
}

/**
 * True when the threshold is one of the three labelled choices.
 * Input is a threshold in milliseconds.
 * A custom number of seconds returns false.
 */
export function isPresetThreshold(ms: number): boolean {
  return THRESHOLD_PRESETS.some((preset) => preset.ms === ms);
}

/**
 * Reads and validates the stored preferences.
 * Input is the storage to read. The app passes localStorage.
 * Invalid JSON, a newer version, or a non-object becomes the defaults.
 * A bad field is replaced on its own. Other keys are returned as extras.
 * A newer version sets canWrite to false so this app does not overwrite it.
 */
export function readPrefs(storage: Storage = localStorage): LoadedPrefs {
  const empty = defaultPrefs();
  let raw: string | null;
  try {
    raw = storage.getItem(PREFS_KEY);
  } catch {
    return { prefs: empty, extras: {}, canWrite: true, changed: true };
  }
  if (raw === null) return { prefs: empty, extras: {}, canWrite: true, changed: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { prefs: empty, extras: {}, canWrite: true, changed: true };
  }
  if (!isPlainObject(parsed)) {
    return { prefs: empty, extras: {}, canWrite: true, changed: true };
  }

  if (typeof parsed.version === "number" && parsed.version !== 1) {
    return { prefs: empty, extras: {}, canWrite: false, changed: false };
  }

  const prefs = defaultPrefs();
  let changed = parsed.version !== 1;
  if (isThresholdMs(parsed.streamThresholdMs)) prefs.streamThresholdMs = parsed.streamThresholdMs;
  else changed = true;
  if (typeof parsed.includePodcasts === "boolean") prefs.includePodcasts = parsed.includePodcasts;
  else changed = true;

  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(parsed)) {
    if (!KNOWN_KEYS.has(key)) extras[key] = parsed[key];
  }
  return { prefs, extras, canWrite: true, changed };
}

/**
 * Applies a patch and drops any threshold that is not a whole number of seconds.
 * Input is the current preferences and the fields the caller wants to change.
 * An invalid field keeps its current value. version stays 1.
 * Returns the next preferences object.
 */
export function applyPrefsPatch(prefs: Prefs, patch: PrefsPatch): Prefs {
  const next = { ...prefs, version: 1 as const };
  if (patch.streamThresholdMs !== undefined && isThresholdMs(patch.streamThresholdMs)) {
    next.streamThresholdMs = patch.streamThresholdMs;
  }
  if (typeof patch.includePodcasts === "boolean") next.includePodcasts = patch.includePodcasts;
  return next;
}

/**
 * Writes the preferences. Unknown keys from the last read are kept.
 * Input is the preferences, those extra keys, and the storage to write.
 * A refused write is ignored. The in-memory preferences stay as they are.
 */
export function writePrefs(
  prefs: Prefs,
  extras: Record<string, unknown>,
  storage: Storage = localStorage,
): void {
  try {
    const stored = { ...extras, ...prefs, version: 1 as const };
    storage.setItem(PREFS_KEY, JSON.stringify(stored));
  } catch {
    // A blocked or full localStorage must not take down the page.
  }
}

/** True for a JSON object that is not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
