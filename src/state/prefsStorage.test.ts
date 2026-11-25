/**
 * Tests for reading and writing the preferences object.
 * A thrown storage call is a blocked browser, not a crash.
 */

import { describe, expect, it } from "vitest";
import {
  PREFS_KEY,
  applyPrefsPatch,
  defaultPrefs,
  readPrefs,
  writePrefs,
} from "./prefsStorage";

describe("readPrefs", () => {
  // Nothing stored yet uses the 30 second default.
  // Input: an empty storage.
  // Expected: version 1, 30000 ms, podcasts off, and nothing to repair.
  it("returns defaults when the key is missing", () => {
    const loaded = readPrefs(memoryStorage());
    expect(loaded.prefs).toEqual(defaultPrefs());
    expect(loaded.changed).toBe(false);
    expect(loaded.canWrite).toBe(true);
  });

  // Broken JSON does not throw and does not keep a partial value.
  // Input: the key set to "{".
  // Expected: defaults, marked changed so the provider can replace the text.
  it("returns defaults when the stored text is not JSON", () => {
    const loaded = readPrefs(memoryStorage("{"));
    expect(loaded.prefs).toEqual(defaultPrefs());
    expect(loaded.changed).toBe(true);
  });

  // A bad threshold does not throw away a valid podcast choice.
  // Input: streamThresholdMs is the string "30" and includePodcasts is true.
  // Expected: the threshold falls back to 30000 and podcasts stay on.
  it("replaces an invalid threshold and keeps a valid podcast flag", () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 1, streamThresholdMs: "30", includePodcasts: true }),
    );
    const loaded = readPrefs(storage);
    expect(loaded.prefs.streamThresholdMs).toBe(30_000);
    expect(loaded.prefs.includePodcasts).toBe(true);
    expect(loaded.changed).toBe(true);
  });

  // A bad podcast flag does not throw away a custom threshold.
  // Input: includePodcasts is "yes" and the threshold is 90 seconds.
  // Expected: podcasts fall back to false and 90000 ms stays.
  it("replaces an invalid podcast flag and keeps a custom threshold", () => {
    const loaded = readPrefs(
      memoryStorage(
        JSON.stringify({ version: 1, streamThresholdMs: 90_000, includePodcasts: "yes" }),
      ),
    );
    expect(loaded.prefs.streamThresholdMs).toBe(90_000);
    expect(loaded.prefs.includePodcasts).toBe(false);
  });

  // Fractions, negatives, and a threshold past 24 hours are not a listen time.
  // Input: one stored object for each rejected number.
  // Expected: each read uses the 30 second default.
  it("rejects a fraction, a negative, and a threshold past 24 hours", () => {
    for (const streamThresholdMs of [1_500, -1_000, 25 * 60 * 60 * 1000, 30_000.5]) {
      const loaded = readPrefs(
        memoryStorage(JSON.stringify({ version: 1, streamThresholdMs, includePodcasts: false })),
      );
      expect(loaded.prefs.streamThresholdMs).toBe(30_000);
    }
  });

  // A future version is left for the code that understands it.
  // Input: version 2 with a custom threshold.
  // Expected: in-memory defaults, and canWrite false so the stored text stays.
  it("does not adopt or overwrite a newer version", () => {
    const text = JSON.stringify({ version: 2, streamThresholdMs: 90_000, includePodcasts: true });
    const storage = memoryStorage(text);
    const loaded = readPrefs(storage);
    expect(loaded.prefs).toEqual(defaultPrefs());
    expect(loaded.canWrite).toBe(false);
    expect(storage.getItem(PREFS_KEY)).toBe(text);
  });

  // A storage that throws is the same as a missing key, except it needs repair.
  // Input: getItem throws.
  // Expected: defaults and changed true. The function does not throw.
  it("returns defaults when storage throws", () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error("blocked");
    };
    const loaded = readPrefs(storage);
    expect(loaded.prefs).toEqual(defaultPrefs());
    expect(loaded.changed).toBe(true);
  });
});

describe("writePrefs", () => {
  // A custom threshold and an unknown key both survive a write.
  // Input: 45 seconds, podcasts on, and a graphQuery key this version does not use.
  // Expected: the next read returns both, plus the unknown key.
  it("round-trips a custom threshold and keeps an unknown key", () => {
    const storage = memoryStorage();
    const prefs = { ...defaultPrefs(), streamThresholdMs: 45_000, includePodcasts: true };
    writePrefs(prefs, { graphQuery: { m: "time" } }, storage);
    const loaded = readPrefs(storage);
    expect(loaded.prefs).toEqual(prefs);
    expect(loaded.extras).toEqual({ graphQuery: { m: "time" } });
    expect(loaded.changed).toBe(false);
  });

  // A refused write does not throw.
  // Input: setItem throws.
  // Expected: writePrefs returns without an error.
  it("ignores a refused write", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    expect(() => writePrefs(defaultPrefs(), {}, storage)).not.toThrow();
  });
});

describe("applyPrefsPatch", () => {
  // An out-of-range threshold does not replace the current one.
  // Input: a patch whose threshold is 1.5 seconds, and a patch that turns podcasts on.
  // Expected: the threshold stays 30000 and podcasts become true.
  it("keeps the current threshold when the patch is not a whole number of seconds", () => {
    const next = applyPrefsPatch(defaultPrefs(), {
      streamThresholdMs: 1_500,
      includePodcasts: true,
    });
    expect(next.streamThresholdMs).toBe(30_000);
    expect(next.includePodcasts).toBe(true);
  });
});

/** A storage that holds one optional prefs string. */
function memoryStorage(initial?: string): Storage {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(PREFS_KEY, initial);
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}
