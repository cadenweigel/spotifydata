/**
 * Tests for the home-page totals. Threshold and podcasts change the counts.
 * Casing and track URIs follow the same identity rules as the tables will.
 */

import { describe, expect, it } from "vitest";
import type { Stream } from "@/data/types";
import { summarizeListening } from "./listenSummary";

describe("summarizeListening", () => {
  // Short plays drop out. The listen time is the sum of the plays that stay.
  // Input: 60s, 10s, and 120s, threshold 30s.
  // Expected: 2 included, 1 excluded, 180000 ms, oldest and newest of the included plays.
  it("drops plays under the threshold and sums the rest", () => {
    const summary = summarizeListening(
      [
        stream({ id: 0, endedAt: "2020-06-01T00:00:00.000Z", msPlayed: 10_000 }),
        stream({ id: 1, endedAt: "2020-01-01T00:00:00.000Z", msPlayed: 60_000 }),
        stream({ id: 2, endedAt: "2021-01-01T00:00:00.000Z", msPlayed: 120_000 }),
      ],
      30_000,
      false,
    );
    expect(summary.included).toBe(2);
    expect(summary.excludedByThreshold).toBe(1);
    expect(summary.listenTimeMs).toBe(180_000);
    expect(summary.firstEndedAt).toBe("2020-01-01T00:00:00.000Z");
    expect(summary.lastEndedAt).toBe("2021-01-01T00:00:00.000Z");
  });

  // "Ada" and "ada" are one artist. Two URIs are two tracks.
  // Input: the same artist spelled two ways, and two track URIs.
  // Expected: 1 artist and 2 tracks.
  it("counts artists by casing and tracks by URI", () => {
    const summary = summarizeListening(
      [
        stream({ id: 0, artist: "Ada", track: "One", trackUri: "spotify:track:1" }),
        stream({ id: 1, artist: "ada", track: "Two", trackUri: "spotify:track:2" }),
      ],
      0,
      false,
    );
    expect(summary.artistCount).toBe(1);
    expect(summary.trackCount).toBe(2);
  });

  // No URI: the album keeps two editions apart.
  // Input: one title and artist, two album names, both without a URI.
  // Expected: 2 tracks.
  it("keeps local editions apart when the album differs", () => {
    const summary = summarizeListening(
      [
        stream({ id: 0, album: "First", trackUri: null }),
        stream({ id: 1, album: "Second", trackUri: null }),
      ],
      0,
      false,
    );
    expect(summary.trackCount).toBe(2);
  });

  // Podcasts are out by default, and they are not counted as short plays.
  // Input: one music play and one podcast, podcasts off, threshold 30s.
  // Expected: the podcast is left out, and the music play is included.
  it("leaves podcasts out unless they are turned on", () => {
    const music = stream({ id: 0, msPlayed: 60_000 });
    const podcast = stream({
      id: 1,
      artist: "Show",
      track: "Episode",
      msPlayed: 5_000,
      isPodcast: true,
      endedAt: "2022-01-01T00:00:00.000Z",
    });
    const off = summarizeListening([music, podcast], 30_000, false);
    expect(off.included).toBe(1);
    expect(off.excludedByThreshold).toBe(0);
    expect(off.podcastsLeftOut).toBe(1);
    expect(off.artistCount).toBe(1);

    const on = summarizeListening([music, podcast], 30_000, true);
    expect(on.included).toBe(1);
    expect(on.excludedByThreshold).toBe(1);
    expect(on.podcastsLeftOut).toBe(0);
    expect(on.lastEndedAt).toBe("2020-01-01T00:00:00.000Z");
  });
});

/** A music play with the fields a summary reads. Overrides replace the defaults. */
function stream(overrides: Partial<Stream> & Pick<Stream, "id">): Stream {
  return {
    endedAt: "2020-01-01T00:00:00.000Z",
    msPlayed: 60_000,
    artist: "Artist",
    album: null,
    track: "Song",
    trackUri: "spotify:track:song",
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
