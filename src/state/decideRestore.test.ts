/**
 * Tests for every restore branch. The function does not touch a browser store.
 */

import { describe, expect, it } from "vitest";
import type { Dataset } from "@/data/types";
import type { StoredDataset } from "./datasetStore";
import { decideRestore } from "./decideRestore";

const dataset = {
  meta: {
    streamCount: 1,
    musicCount: 1,
    podcastCount: 0,
    ignoredVideoFiles: 0,
    minEndedAt: "2020-01-01T00:00:00.000Z",
    maxEndedAt: "2020-01-01T00:00:00.000Z",
    sourceFiles: ["Streaming_History_Audio_2019.json"],
  },
  streams: [],
} satisfies Dataset;

describe("decideRestore", () => {
  // A saved record loads even when this tab has no visit flag.
  // Input: durable true, flag missing, no other tab.
  // Expected: load.
  it("loads a durable record with no visit flag", () => {
    expect(
      decideRestore({
        record: stored(true),
        visitFlag: false,
        otherTabOwnsVisit: false,
      }),
    ).toBe("load");
  });

  // A saved record still loads when another tab is open.
  // Input: durable true, and another tab owns a visit.
  // Expected: load.
  it("loads a durable record while another tab has a visit", () => {
    expect(
      decideRestore({
        record: stored(true),
        visitFlag: false,
        otherTabOwnsVisit: true,
      }),
    ).toBe("load");
  });

  // This tab's own session record comes back on reload.
  // Input: durable false, and this tab's flag is set.
  // Expected: load.
  it("loads a session record when this tab's flag is set", () => {
    expect(
      decideRestore({
        record: stored(false),
        visitFlag: true,
        otherTabOwnsVisit: false,
      }),
    ).toBe("load");
  });

  // A new tab does not show another tab's session, and does not delete it.
  // Input: durable false, no flag here, another tab answered.
  // Expected: empty.
  it("stays empty when another tab owns the session record", () => {
    expect(
      decideRestore({
        record: stored(false),
        visitFlag: false,
        otherTabOwnsVisit: true,
      }),
    ).toBe("empty");
  });

  // A leftover session record is removed when nobody still has the flag.
  // Input: durable false, no flag, no answer from another tab.
  // Expected: empty-and-delete.
  it("deletes a leftover session record when no tab owns it", () => {
    expect(
      decideRestore({
        record: stored(false),
        visitFlag: false,
        otherTabOwnsVisit: false,
      }),
    ).toBe("empty-and-delete");
  });

  // Nothing stored means an empty screen, even if a stale flag is set.
  // Input: no record.
  // Expected: empty.
  it("stays empty when there is no record", () => {
    expect(
      decideRestore({ record: null, visitFlag: true, otherTabOwnsVisit: false }),
    ).toBe("empty");
    expect(
      decideRestore({ record: null, visitFlag: false, otherTabOwnsVisit: true }),
    ).toBe("empty");
  });
});

/** A stored record. The durable flag is the only part this file varies. */
function stored(durable: boolean): StoredDataset {
  return { schemaVersion: 1, durable, dataset };
}
