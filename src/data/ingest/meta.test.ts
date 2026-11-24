/**
 * Tests for computeMeta. Streams are built in the test and are already
 * sorted, which is the order normalizeFiles produces.
 */

import { describe, expect, it } from "vitest";
import type { Stream } from "@/data/types";
import { computeMeta } from "./meta";

function stream(
  overrides: Partial<Stream> & Pick<Stream, "endedAt" | "isPodcast">,
): Stream {
  return {
    id: 0,
    msPlayed: 1000,
    artist: "Artist",
    album: null,
    track: "Track",
    trackUri: null,
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

describe("computeMeta", () => {
  // Counts music and podcasts apart, and takes the date range from the ends.
  // Input: music, podcast, music, already sorted, plus two source names and 4 video files.
  // Expected: 3 streams, 2 music, 1 podcast, the first and last times, those names, and 4.
  it("counts music and podcasts, the date range, and video files", () => {
    const meta = computeMeta(
      [
        stream({
          id: 0,
          endedAt: "2018-01-01T00:00:00.000Z",
          isPodcast: false,
        }),
        stream({
          id: 1,
          endedAt: "2019-06-01T00:00:00.000Z",
          isPodcast: true,
          track: "Episode",
        }),
        stream({
          id: 2,
          endedAt: "2020-12-31T23:00:00.000Z",
          isPodcast: false,
        }),
      ],
      ["Streaming_History_Audio_2018.json", "endsong_0.json"],
      { ignoredVideoFiles: 4 },
    );

    expect(meta).toEqual({
      streamCount: 3,
      musicCount: 2,
      podcastCount: 1,
      ignoredVideoFiles: 4,
      minEndedAt: "2018-01-01T00:00:00.000Z",
      maxEndedAt: "2020-12-31T23:00:00.000Z",
      sourceFiles: ["Streaming_History_Audio_2018.json", "endsong_0.json"],
    });
  });

  // An empty list has no date range.
  // Input: no streams, no source files, and no video files.
  // Expected: every count is 0 and both ends are null.
  it("returns a null date range when there are no streams", () => {
    expect(computeMeta([], [], { ignoredVideoFiles: 0 })).toEqual({
      streamCount: 0,
      musicCount: 0,
      podcastCount: 0,
      ignoredVideoFiles: 0,
      minEndedAt: null,
      maxEndedAt: null,
      sourceFiles: [],
    });
  });

  // One stream is both the start and the end of the range.
  // Input: a single podcast.
  // Expected: both dates are that stream's endedAt, and the podcast count is 1.
  it("uses the only stream for both ends of the range", () => {
    const meta = computeMeta(
      [stream({ endedAt: "2014-07-27T20:34:47.000Z", isPodcast: true })],
      ["Streaming_History_Audio_2014.json"],
      { ignoredVideoFiles: 0 },
    );

    expect(meta.minEndedAt).toBe("2014-07-27T20:34:47.000Z");
    expect(meta.maxEndedAt).toBe("2014-07-27T20:34:47.000Z");
    expect(meta.musicCount).toBe(0);
    expect(meta.podcastCount).toBe(1);
    expect(meta.streamCount).toBe(1);
  });

  // The summary keeps its own copy of the file names.
  // Input: one stream and a source-file array that is changed after the call.
  // Expected: the summary still lists the original name.
  it("copies the source file names", () => {
    const names = ["Streaming_History_Audio_2019.json"];
    const meta = computeMeta(
      [stream({ endedAt: "2019-01-01T00:00:00.000Z", isPodcast: false })],
      names,
      { ignoredVideoFiles: 0 },
    );

    names.push("extra.json");

    expect(meta.sourceFiles).toEqual(["Streaming_History_Audio_2019.json"]);
  });

  // The range is the first and last element, which the caller has already sorted.
  // Input: three streams whose middle time is earlier than the first.
  // Expected: min is the first stream and max is the last, not the middle.
  it("reads the date range from the first and last stream", () => {
    const meta = computeMeta(
      [
        stream({ endedAt: "2019-06-01T00:00:00.000Z", isPodcast: false }),
        stream({ endedAt: "2018-01-01T00:00:00.000Z", isPodcast: false }),
        stream({ endedAt: "2020-01-01T00:00:00.000Z", isPodcast: false }),
      ],
      [],
      { ignoredVideoFiles: 0 },
    );

    expect(meta.minEndedAt).toBe("2019-06-01T00:00:00.000Z");
    expect(meta.maxEndedAt).toBe("2020-01-01T00:00:00.000Z");
  });
});
