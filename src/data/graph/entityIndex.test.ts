/**
 * Tests for the entity search index.
 * Order is stream count, and the typed text only filters that list.
 */

import { describe, expect, it } from "vitest";
import type { Stream } from "@/data/types";
import { entityIndex, matchEntityHits } from "./entityIndex";

function play(overrides: Partial<Stream> & Pick<Stream, "id" | "artist" | "track">): Stream {
  return {
    endedAt: "2020-06-15T18:00:00.000Z",
    msPlayed: 60_000,
    album: "Album",
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
    ...overrides,
  };
}

describe("entityIndex", () => {
  // The first suggestion is the artist with the most plays.
  // Input: Ada twice, Bea once, a short play, and a podcast.
  // Expected: Ada then Bea. The short play and the podcast are absent.
  it("sorts by stream count and follows the listen settings", () => {
    const hits = entityIndex(
      [
        play({ id: 1, artist: "Bea", track: "One" }),
        play({ id: 2, artist: "Ada", track: "Two" }),
        play({ id: 3, artist: "Ada", track: "Three" }),
        play({ id: 4, artist: "Short", track: "Skip", msPlayed: 1_000 }),
        play({ id: 5, artist: "Show", track: "Episode", isPodcast: true }),
      ],
      "artist",
      { thresholdMs: 30_000, includePodcasts: false },
    );
    expect(hits.map((hit) => hit.name)).toEqual(["Ada", "Bea"]);
    expect(hits[0]?.streams).toBe(2);
  });
});

describe("matchEntityHits", () => {
  // Typing filters by a case-insensitive substring and skips chosen keys.
  // Input: three artists and the text "a", with Ada already chosen.
  // Expected: Bea only. A blank query returns nothing.
  it("returns at most the unmatched names that contain the text", () => {
    const hits = [
      { key: "ada", name: "Ada", streams: 3 },
      { key: "bea", name: "Bea", streams: 2 },
      { key: "cy", name: "Cy", streams: 1 },
    ];
    expect(matchEntityHits(hits, "a", new Set(["ada"])).map((hit) => hit.name)).toEqual(["Bea"]);
    expect(matchEntityHits(hits, "  ", new Set())).toEqual([]);
  });

  // The list stops at ten even when more names match.
  // Input: twelve artists whose names contain "n", and an empty selection.
  // Expected: the first ten, in the index order.
  it("stops at ten suggestions", () => {
    const hits = Array.from({ length: 12 }, (_, index) => ({
      key: `n${index}`,
      name: `Name ${index}`,
      streams: 12 - index,
    }));
    expect(matchEntityHits(hits, "name", new Set())).toHaveLength(10);
  });
});
