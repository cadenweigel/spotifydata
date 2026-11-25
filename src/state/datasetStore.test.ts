/**
 * Tests for the stored-record shape and the visit flag.
 * IndexedDB is not opened here. The shape check is what get and the
 * in-memory fake both use.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { Dataset } from "@/data/types";
import {
  acceptStoredDataset,
  clearVisitFlag,
  otherTabOwnsVisit,
  readStoredValue,
  readVisitFlag,
  setVisitFlag,
} from "./datasetStore";

const dataset = {
  meta: {
    streamCount: 1,
    musicCount: 1,
    podcastCount: 0,
    ignoredVideoFiles: 0,
    minEndedAt: null,
    maxEndedAt: null,
    sourceFiles: ["a.json"],
  },
  streams: [
    {
      id: 0,
      endedAt: "2020-01-01T00:00:00.000Z",
      msPlayed: 30_000,
      artist: "Artist",
      album: null,
      track: "Song",
      trackUri: null,
      isPodcast: false,
      platform: null,
      country: null,
      reasonStart: null,
      reasonEnd: null,
      shuffle: null,
      skipped: null,
      offline: null,
      incognito: null,
    },
  ],
} satisfies Dataset;

afterEach(() => {
  clearVisitFlag();
});

describe("readStoredValue", () => {
  // A version the app does not know is thrown away.
  // Input: schemaVersion 2 with an otherwise usable dataset.
  // Expected: no record, and the caller is told to delete it.
  it("treats a bad schemaVersion as missing", () => {
    const read = readStoredValue({ schemaVersion: 2, durable: true, dataset });
    expect(read.record).toBeNull();
    expect(read.deleteRecord).toBe(true);
    expect(acceptStoredDataset({ schemaVersion: 2, durable: false, dataset })).toBeNull();
  });

  // A value that is not a dataset is thrown away.
  // Input: schema 1 with a dataset that has no streams array.
  // Expected: delete, and no record.
  it("treats a bad dataset shape as missing", () => {
    const read = readStoredValue({
      schemaVersion: 1,
      durable: false,
      dataset: { meta: dataset.meta },
    });
    expect(read.record).toBeNull();
    expect(read.deleteRecord).toBe(true);
  });

  // An empty database slot is not a bad record.
  // Input: undefined, which is what a missing key reads back as.
  // Expected: no record, and nothing to delete.
  it("leaves a missing record alone", () => {
    expect(readStoredValue(undefined)).toEqual({ record: null, deleteRecord: false });
    expect(readStoredValue(null)).toEqual({ record: null, deleteRecord: false });
  });

  // A current record is kept as-is.
  // Input: schema 1, durable, and a dataset.
  // Expected: that record, and no delete.
  it("accepts a version 1 record", () => {
    const read = readStoredValue({ schemaVersion: 1, durable: true, dataset });
    expect(read.deleteRecord).toBe(false);
    expect(read.record?.durable).toBe(true);
    expect(read.record?.dataset.streams[0]?.track).toBe("Song");
  });
});

describe("visit flag", () => {
  // The flag is a session mark, not the streams.
  // Input: set, then clear.
  // Expected: it reads back as set, then as missing.
  it("sets and clears the session flag", () => {
    expect(readVisitFlag()).toBe(false);
    setVisitFlag();
    expect(readVisitFlag()).toBe(true);
    clearVisitFlag();
    expect(readVisitFlag()).toBe(false);
  });
});

describe("otherTabOwnsVisit", () => {
  // No BroadcastChannel means nobody else owns the visit.
  // Input: this jsdom environment, which has no BroadcastChannel.
  // Expected: false, without waiting out the 300 ms answer window.
  it("reports no owner when no other tab answers", async () => {
    await expect(otherTabOwnsVisit()).resolves.toBe(false);
  });
});
