/**
 * Tests for streamsMeetingThreshold. Streams are built here and are not
 * from a Spotify export.
 */

import { describe, expect, it } from "vitest";
import type { Stream } from "@/data/types";
import { streamsMeetingThreshold } from "./threshold";

function stream(msPlayed: number, track: string): Stream {
  return {
    id: 0,
    endedAt: "2019-01-01T00:00:00.000Z",
    msPlayed,
    artist: "Artist",
    album: null,
    track,
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
  };
}

describe("streamsMeetingThreshold", () => {
  // A 30 second threshold keeps 30s and 31s.
  // Input: plays of 10s, 30s, and 31s, in that order, and a threshold of 30_000.
  // Expected: the 30s and 31s streams, still in that order.
  it("keeps plays of 30s and 31s at a 30s threshold", () => {
    const ten = stream(10_000, "10s");
    const thirty = stream(30_000, "30s");
    const thirtyOne = stream(31_000, "31s");

    expect(streamsMeetingThreshold([ten, thirty, thirtyOne], 30_000)).toEqual([
      thirty,
      thirtyOne,
    ]);
  });

  // The threshold is inclusive, and the result stays in input order.
  // Input: 31s, then 10s, then 30s.
  // Expected: 31s, then 30s, the same objects.
  it("keeps an exact match and preserves order", () => {
    const thirtyOne = stream(31_000, "31s");
    const ten = stream(10_000, "10s");
    const thirty = stream(30_000, "30s");
    const input = [thirtyOne, ten, thirty];

    const kept = streamsMeetingThreshold(input, 30_000);

    expect(kept).toEqual([thirtyOne, thirty]);
    expect(kept[0]).toBe(thirtyOne);
    expect(kept[1]).toBe(thirty);
    expect(input).toHaveLength(3);
  });

  // Zero means every play counts, including a zero-length one.
  // Input: a 0ms play and a 10s play, threshold 0.
  // Expected: both streams.
  it("keeps every stream at a threshold of 0", () => {
    const zero = stream(0, "Zero");
    const ten = stream(10_000, "10s");

    expect(streamsMeetingThreshold([zero, ten], 0)).toEqual([zero, ten]);
  });
});
