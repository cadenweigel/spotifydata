/**
 * Tests for filterStreams, groupEntities, and the table helpers that sort,
 * search, and page those rows. Streams are built here and are not from a
 * Spotify export. Day bounds are local calendar days, so filter fixtures
 * are built with the local Date constructor and then stored as UTC ISO
 * strings, the same form as endedAt.
 */

import { describe, expect, it } from "vitest";
import type { EntityRow, Stream } from "@/data/types";
import {
  filterStreams,
  groupEntities,
  paginate,
  searchEntities,
  sortEntities,
  type StreamFilter,
} from "./aggregate";

const open: StreamFilter = {
  thresholdMs: 0,
  includePodcasts: true,
  from: null,
  to: null,
};

function stream(overrides: Partial<Stream> & Pick<Stream, "endedAt">): Stream {
  return {
    id: 0,
    msPlayed: 60_000,
    artist: "Artist",
    album: null,
    track: "Track",
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

/** UTC ISO for a clock time on a local calendar day. Month is 1-based. */
function localIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): string {
  return new Date(year, month - 1, day, hour, minute, second, ms).toISOString();
}

describe("filterStreams", () => {
  // Both ends of a local day are included, and the next and previous milliseconds are not.
  // Input: five plays around 2024-03-05, from and to both that day.
  // Expected: local midnight, midday, and the last millisecond of March 5, in that order.
  it("includes both ends of a local day", () => {
    const before = stream({
      id: 1,
      track: "Before",
      endedAt: new Date(new Date(2024, 2, 5, 0, 0, 0, 0).getTime() - 1).toISOString(),
    });
    const start = stream({ id: 2, track: "Start", endedAt: localIso(2024, 3, 5, 0, 0, 0, 0) });
    const midday = stream({ id: 3, track: "Mid", endedAt: localIso(2024, 3, 5, 12, 0, 0, 0) });
    const end = stream({ id: 4, track: "End", endedAt: localIso(2024, 3, 5, 23, 59, 59, 999) });
    const after = stream({ id: 5, track: "After", endedAt: localIso(2024, 3, 6, 0, 0, 0, 0) });

    const kept = filterStreams([before, start, midday, end, after], {
      ...open,
      from: "2024-03-05",
      to: "2024-03-05",
    });

    expect(kept).toEqual([start, midday, end]);
    expect(kept[0]).toBe(start);
    expect(kept[2]).toBe(end);
  });

  // A play on the local day is kept even when its UTC date is the day before or after.
  // Input: local midnight and the last millisecond of 2024-03-05, filtered to that day.
  // Expected: both plays. Outside UTC, at least one of those instants has a different UTC date.
  it("treats the bounds as local days rather than UTC dates", () => {
    const startIso = localIso(2024, 3, 5, 0, 0, 0, 0);
    const endIso = localIso(2024, 3, 5, 23, 59, 59, 999);
    const start = stream({ id: 1, track: "Start", endedAt: startIso });
    const end = stream({ id: 2, track: "End", endedAt: endIso });

    expect(
      filterStreams([start, end], { ...open, from: "2024-03-05", to: "2024-03-05" }),
    ).toEqual([start, end]);

    if (new Date(2024, 2, 5).getTimezoneOffset() !== 0) {
      const sameUtcDay = startIso.slice(0, 10) === "2024-03-05" && endIso.slice(0, 10) === "2024-03-05";
      expect(sameUtcDay).toBe(false);
    }
  });

  // An inverted range matches nothing and does not throw.
  // Input: a play on March 5, with from the next day and to March 5.
  // Expected: an empty array.
  it("returns an empty array when from is after to", () => {
    const play = stream({ endedAt: localIso(2024, 3, 5, 12) });

    expect(
      filterStreams([play], { ...open, from: "2024-03-06", to: "2024-03-05" }),
    ).toEqual([]);
  });

  // A missing bound leaves that side open.
  // Input: plays on March 4, 5, and 6. One call has only `to`, one has only `from`.
  // Expected: March 4 and 5 when `to` is March 5; March 5 and 6 when `from` is March 5.
  it("leaves a null bound open", () => {
    const march4 = stream({ id: 1, track: "4", endedAt: localIso(2024, 3, 4, 12) });
    const march5 = stream({ id: 2, track: "5", endedAt: localIso(2024, 3, 5, 12) });
    const march6 = stream({ id: 3, track: "6", endedAt: localIso(2024, 3, 6, 12) });
    const plays = [march4, march5, march6];

    expect(filterStreams(plays, { ...open, from: null, to: "2024-03-05" })).toEqual([
      march4,
      march5,
    ]);
    expect(filterStreams(plays, { ...open, from: "2024-03-05", to: null })).toEqual([
      march5,
      march6,
    ]);
  });

  // Podcasts are off unless the setting says otherwise.
  // Input: one music play and one podcast, both long enough, with no date bounds.
  // Expected: music only when podcasts are excluded; both when they are included.
  it("drops podcasts unless includePodcasts is true", () => {
    const music = stream({ id: 1, track: "Song", endedAt: localIso(2024, 3, 5, 12) });
    const podcast = stream({
      id: 2,
      track: "Episode",
      isPodcast: true,
      endedAt: localIso(2024, 3, 5, 13),
    });

    expect(
      filterStreams([music, podcast], { ...open, includePodcasts: false }),
    ).toEqual([music]);
    expect(
      filterStreams([music, podcast], { ...open, includePodcasts: true }),
    ).toEqual([music, podcast]);
  });

  // The threshold is inclusive. A shorter play is dropped, including a short podcast.
  // Input: 29.999s music, 30s music, and a 30s podcast, threshold 30_000, podcasts on.
  // Expected: the two plays of exactly 30 seconds.
  it("drops plays shorter than the threshold and keeps an exact match", () => {
    const short = stream({
      id: 1,
      track: "Short",
      msPlayed: 29_999,
      endedAt: localIso(2024, 3, 5, 12),
    });
    const exact = stream({
      id: 2,
      track: "Exact",
      msPlayed: 30_000,
      endedAt: localIso(2024, 3, 5, 13),
    });
    const shortPodcast = stream({
      id: 3,
      track: "Clip",
      msPlayed: 10_000,
      isPodcast: true,
      endedAt: localIso(2024, 3, 5, 14),
    });

    expect(
      filterStreams([short, exact, shortPodcast], {
        ...open,
        thresholdMs: 30_000,
        includePodcasts: true,
      }),
    ).toEqual([exact]);
  });

  // All three rules run together and the survivors stay in input order.
  // Input: a short song, a long podcast, a long song on the day, and a long song the next day.
  // Expected: the podcast and the in-range song, same objects, input array unchanged.
  it("applies every condition in one pass and keeps input order", () => {
    const short = stream({
      id: 1,
      track: "Short",
      msPlayed: 1_000,
      endedAt: localIso(2024, 3, 5, 10),
    });
    const podcast = stream({
      id: 2,
      track: "Episode",
      isPodcast: true,
      endedAt: localIso(2024, 3, 5, 11),
    });
    const onDay = stream({ id: 3, track: "On day", endedAt: localIso(2024, 3, 5, 12) });
    const nextDay = stream({ id: 4, track: "Next", endedAt: localIso(2024, 3, 6, 12) });
    const input = [short, podcast, onDay, nextDay];

    const kept = filterStreams(input, {
      thresholdMs: 30_000,
      includePodcasts: true,
      from: "2024-03-05",
      to: "2024-03-05",
    });

    expect(kept).toEqual([podcast, onDay]);
    expect(kept[0]).toBe(podcast);
    expect(input).toHaveLength(4);
    expect(input[0]).toBe(short);
  });
});

describe("groupEntities", () => {
  // Three plays of one artist become one row, even when the dates are out of order.
  // Input: 10s, 20s, and 30s by Led Zeppelin, dated 2020 then 2018 then 2019, plus one other artist.
  // Expected: listen time 60s, first stream 2018, last stream 2020, and a separate row for the other artist.
  it("sums one artist and keeps the earliest and latest dates", () => {
    const plays = [
      stream({
        artist: "Led Zeppelin",
        msPlayed: 10_000,
        endedAt: "2020-03-01T00:00:00.000Z",
      }),
      stream({
        artist: "Led Zeppelin",
        msPlayed: 20_000,
        endedAt: "2018-01-01T00:00:00.000Z",
      }),
      stream({
        artist: "Led Zeppelin",
        msPlayed: 30_000,
        endedAt: "2019-06-01T00:00:00.000Z",
      }),
      stream({ artist: "Other", msPlayed: 5_000, endedAt: "2021-01-01T00:00:00.000Z" }),
    ];

    const rows = groupEntities(plays, "artist");
    const led = rows.find((row) => row.key === "led zeppelin");

    expect(led).toEqual({
      key: "led zeppelin",
      name: "Led Zeppelin",
      subtitle: null,
      streams: 3,
      listenTimeMs: 60_000,
      firstStream: "2018-01-01T00:00:00.000Z",
      lastStream: "2020-03-01T00:00:00.000Z",
      trackCount: 1,
      albumCount: null,
      skipRate: null,
    });
    expect(rows).toHaveLength(2);
    expect(plays).toHaveLength(4);
  });

  // Spacing and case differences are one artist.
  // Input: three spellings of the same name.
  // Expected: one row, three plays, and the key in lowercase.
  it("collapses casing and spacing variants of one artist", () => {
    const rows = groupEntities(
      [
        stream({ artist: "Led Zeppelin", endedAt: "2018-01-01T00:00:00.000Z" }),
        stream({ artist: "led zeppelin", endedAt: "2019-01-01T00:00:00.000Z" }),
        stream({ artist: "  LED   ZEPPELIN ", endedAt: "2020-01-01T00:00:00.000Z" }),
      ],
      "artist",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("led zeppelin");
    expect(rows[0]?.streams).toBe(3);
  });

  // The displayed casing is the one that occurred most, and a tie keeps the first.
  // Input: "Beta" twice and "BETA" once, then "Abba" once and "ABBA" once.
  // Expected: "Beta", and "Abba" because it was seen before "ABBA".
  it("picks the most frequent casing and breaks ties by first seen", () => {
    const rows = groupEntities(
      [
        stream({ artist: "Beta", endedAt: "2018-01-01T00:00:00.000Z" }),
        stream({ artist: "BETA", endedAt: "2018-02-01T00:00:00.000Z" }),
        stream({ artist: "Beta", endedAt: "2018-03-01T00:00:00.000Z" }),
        stream({ artist: "Abba", endedAt: "2019-01-01T00:00:00.000Z" }),
        stream({ artist: "ABBA", endedAt: "2019-02-01T00:00:00.000Z" }),
      ],
      "artist",
    );

    expect(rows.find((row) => row.key === "beta")?.name).toBe("Beta");
    expect(rows.find((row) => row.key === "abba")?.name).toBe("Abba");
  });

  // A missing artist is one group, labeled only when it is shown.
  // Input: a blank artist and a whitespace artist.
  // Expected: key "", name "Unknown artist", two plays.
  it("groups a blank artist under an empty key", () => {
    const rows = groupEntities(
      [
        stream({ artist: "", endedAt: "2018-01-01T00:00:00.000Z" }),
        stream({ artist: "   ", endedAt: "2019-01-01T00:00:00.000Z" }),
      ],
      "artist",
    );

    expect(rows).toEqual([
      expect.objectContaining({ key: "", name: "Unknown artist", streams: 2, subtitle: null }),
    ]);
  });

  // Album groups ignore plays with no album, and the same title by two artists stays split.
  // Input: a null album, two casings of one album, that title by someone else, and a blank artist.
  // Expected: three album rows, "IV" as the majority casing, and no invented album for the null play.
  it("skips null albums and keys an album by artist and title", () => {
    const plays = [
      stream({
        artist: "Led Zeppelin",
        album: null,
        track: "Local",
        endedAt: "2018-01-01T00:00:00.000Z",
      }),
      stream({
        artist: "Led Zeppelin",
        album: "IV",
        track: "Black Dog",
        endedAt: "2018-02-01T00:00:00.000Z",
      }),
      stream({
        artist: "led zeppelin",
        album: "iv",
        track: "Rock and Roll",
        endedAt: "2018-03-01T00:00:00.000Z",
      }),
      stream({
        artist: "Led Zeppelin",
        album: "IV",
        track: "Misty Mountain Hop",
        endedAt: "2018-04-01T00:00:00.000Z",
      }),
      stream({
        artist: "Page",
        album: "IV",
        track: "Other",
        endedAt: "2018-05-01T00:00:00.000Z",
      }),
      stream({
        artist: "  ",
        album: "Untitled",
        track: "Song",
        endedAt: "2018-06-01T00:00:00.000Z",
      }),
    ];

    const rows = groupEntities(plays, "album");

    expect(rows).toEqual([
      expect.objectContaining({
        key: "led zeppelin\u0000iv",
        name: "IV",
        subtitle: "Led Zeppelin",
        streams: 3,
      }),
      expect.objectContaining({
        key: "page\u0000iv",
        name: "IV",
        subtitle: "Page",
        streams: 1,
      }),
      expect.objectContaining({
        key: "\u0000untitled",
        name: "Untitled",
        subtitle: "Unknown artist",
        streams: 1,
      }),
    ]);
    expect(groupEntities([plays[0]!], "album")).toEqual([]);
  });

  // A URI identifies a track. Without one, the album keeps two editions apart.
  // Input: one URI under two titles, a second URI with the same title, and two editions with no URI.
  // Expected: four rows. The shared URI uses the more common title and subtitle.
  it("splits different URIs and editions, and merges one URI", () => {
    const rows = groupEntities(
      [
        stream({
          artist: "Led Zeppelin",
          album: "IV",
          track: "Black Dog",
          trackUri: "spotify:track:aaa",
          endedAt: "2018-01-01T00:00:00.000Z",
        }),
        stream({
          artist: "LED ZEPPELIN",
          album: "iv",
          track: "black dog",
          trackUri: "spotify:track:aaa",
          endedAt: "2018-02-01T00:00:00.000Z",
        }),
        stream({
          artist: "Led Zeppelin",
          album: "IV",
          track: "Black Dog",
          trackUri: "spotify:track:aaa",
          endedAt: "2018-03-01T00:00:00.000Z",
        }),
        stream({
          artist: "Led Zeppelin",
          album: "IV",
          track: "Black Dog",
          trackUri: "spotify:track:bbb",
          endedAt: "2018-04-01T00:00:00.000Z",
        }),
        stream({
          artist: "Led Zeppelin",
          album: "IV",
          track: "Black Dog",
          trackUri: null,
          endedAt: "2018-05-01T00:00:00.000Z",
        }),
        stream({
          artist: "Led Zeppelin",
          album: "Remaster",
          track: "Black Dog",
          trackUri: null,
          endedAt: "2018-06-01T00:00:00.000Z",
        }),
      ],
      "track",
    );

    expect(rows.map((row) => row.key)).toEqual([
      "spotify:track:aaa",
      "spotify:track:bbb",
      "led zeppelin\u0000black dog\u0000iv",
      "led zeppelin\u0000black dog\u0000remaster",
    ]);
    expect(rows[0]).toMatchObject({
      name: "Black Dog",
      subtitle: "Led Zeppelin \u2014 IV",
      streams: 3,
      trackCount: null,
      albumCount: null,
    });
  });

  // A play with no album has a shorter track key, and the subtitle is only the artist.
  // Input: two plays of one local track with a null album.
  // Expected: one row, key artist + track, subtitle without an album.
  it("omits a null album from the track key and subtitle", () => {
    const rows = groupEntities(
      [
        stream({
          artist: "Led Zeppelin",
          album: null,
          track: "Local File",
          trackUri: null,
          endedAt: "2018-01-01T00:00:00.000Z",
        }),
        stream({
          artist: "Led Zeppelin",
          album: null,
          track: "Local File",
          trackUri: null,
          endedAt: "2019-01-01T00:00:00.000Z",
        }),
      ],
      "track",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "led zeppelin\u0000local file",
      name: "Local File",
      subtitle: "Led Zeppelin",
      streams: 2,
    });
  });

  // Counts cover the distinct tracks and albums inside an artist, and stay null on other kinds.
  // Input: one URI twice, one URI with no album, and one local edition.
  // Expected: three tracks and two albums for the artist. The album row counts tracks only.
  it("counts distinct tracks and albums only on the kinds that have them", () => {
    const plays = [
      stream({
        artist: "Led Zeppelin",
        album: "IV",
        track: "Black Dog",
        trackUri: "spotify:track:aaa",
        endedAt: "2018-01-01T00:00:00.000Z",
      }),
      stream({
        artist: "Led Zeppelin",
        album: "IV",
        track: "Black Dog",
        trackUri: "spotify:track:aaa",
        endedAt: "2018-02-01T00:00:00.000Z",
      }),
      stream({
        artist: "Led Zeppelin",
        album: null,
        track: "Local",
        trackUri: "spotify:track:local",
        endedAt: "2018-03-01T00:00:00.000Z",
      }),
      stream({
        artist: "Led Zeppelin",
        album: "Remaster",
        track: "Black Dog",
        trackUri: null,
        endedAt: "2018-04-01T00:00:00.000Z",
      }),
    ];

    expect(groupEntities(plays, "artist")[0]).toMatchObject({
      trackCount: 3,
      albumCount: 2,
    });
    expect(groupEntities(plays, "album").every((row) => row.albumCount === null)).toBe(true);
    expect(groupEntities(plays, "album").map((row) => row.trackCount)).toEqual([1, 1]);
    expect(groupEntities([plays[2]!], "artist")[0]?.albumCount).toBeNull();
  });

  // Skip rate ignores plays where skipped is unknown.
  // Input: one skip, one completed play, and two unknown, then a group where every value is null.
  // Expected: 1/2 for the mixed group, and null when nothing is known.
  it("uses known skips only, and is null when skipped is never known", () => {
    const mixed = groupEntities(
      [
        stream({ artist: "Led Zeppelin", skipped: true, endedAt: "2018-01-01T00:00:00.000Z" }),
        stream({ artist: "Led Zeppelin", skipped: false, endedAt: "2018-02-01T00:00:00.000Z" }),
        stream({ artist: "Led Zeppelin", skipped: null, endedAt: "2018-03-01T00:00:00.000Z" }),
        stream({ artist: "Led Zeppelin", skipped: null, endedAt: "2018-04-01T00:00:00.000Z" }),
      ],
      "artist",
    );
    const unknown = groupEntities(
      [
        stream({ artist: "Led Zeppelin", skipped: null, endedAt: "2018-01-01T00:00:00.000Z" }),
        stream({ artist: "Led Zeppelin", skipped: null, endedAt: "2018-02-01T00:00:00.000Z" }),
      ],
      "artist",
    );

    expect(mixed[0]?.skipRate).toBe(0.5);
    expect(unknown[0]?.skipRate).toBeNull();
  });

  // A large artist grouping should finish quickly. The time is logged and is not an assertion,
  // so a slow machine still passes.
  // Input: 300k plays spread across 1000 artists.
  // Expected: 1000 rows, 300 plays each.
  it("groups 300k streams by artist", () => {
    const total = 300_000;
    const artistCount = 1_000;
    const artists = Array.from({ length: artistCount }, (_, index) => `Artist ${index}`);
    const tracks = Array.from({ length: 50 }, (_, index) => `Track ${index}`);
    const albums = Array.from({ length: 10 }, (_, index) => `Album ${index}`);
    const streams: Stream[] = new Array(total);
    for (let index = 0; index < total; index++) {
      streams[index] = stream({
        id: index,
        artist: artists[index % artistCount] ?? "Artist",
        track: tracks[index % tracks.length] ?? "Track",
        album: albums[index % albums.length] ?? "Album",
        endedAt: "2020-06-01T12:00:00.000Z",
        msPlayed: 30_000,
      });
    }

    const start = performance.now();
    const rows = groupEntities(streams, "artist");
    const elapsed = performance.now() - start;
    // The plan asks for this time in the test output.
    // eslint-disable-next-line no-console
    console.info(`groupEntities 300k streams by artist: ${elapsed.toFixed(1)} ms`);

    expect(rows).toHaveLength(artistCount);
    expect(rows[0]?.streams).toBe(total / artistCount);
  }, 30_000);
});

function entity(overrides: Partial<EntityRow> & Pick<EntityRow, "key" | "name">): EntityRow {
  return {
    subtitle: null,
    streams: 1,
    listenTimeMs: 60_000,
    firstStream: "2020-01-01T00:00:00.000Z",
    lastStream: "2020-01-01T00:00:00.000Z",
    trackCount: null,
    albumCount: null,
    skipRate: null,
    ...overrides,
  };
}

describe("sortEntities", () => {
  // First play is oldest first. Last play is newest first.
  // Input: a 2020 play before a 2018 play for the first sort, and the reverse for the last sort.
  // Expected: 2018 then 2020 by first play. 2021 then 2019 by last play.
  it("orders first stream oldest-first and last stream newest-first", () => {
    const older = entity({
      key: "older",
      name: "Older",
      firstStream: "2018-01-01T00:00:00.000Z",
      lastStream: "2019-06-01T00:00:00.000Z",
    });
    const newer = entity({
      key: "newer",
      name: "Newer",
      firstStream: "2020-03-01T00:00:00.000Z",
      lastStream: "2021-01-01T00:00:00.000Z",
    });

    expect(sortEntities([newer, older], "firstStream").map((row) => row.key)).toEqual([
      "older",
      "newer",
    ]);
    expect(sortEntities([older, newer], "lastStream").map((row) => row.key)).toEqual([
      "newer",
      "older",
    ]);
  });

  // Stream count and listen time are both highest first.
  // Input: few long plays, then many short ones.
  // Expected: many first by streams, few first by listen time.
  it("orders streams and listen time highest first", () => {
    const few = entity({ key: "few", name: "Few", streams: 2, listenTimeMs: 500_000 });
    const many = entity({ key: "many", name: "Many", streams: 9, listenTimeMs: 1_000 });

    expect(sortEntities([few, many], "streams").map((row) => row.key)).toEqual(["many", "few"]);
    expect(sortEntities([many, few], "listenTime").map((row) => row.key)).toEqual(["few", "many"]);
  });

  // Equal values break by name, then by key, and a second call matches the first.
  // Input: three rows with the same stream count, two of them named "Alpha".
  // Expected: Alpha keys in key order, then Beta. Calling sort again is identical.
  it("breaks ties the same way on every call", () => {
    const beta = entity({ key: "b", name: "Beta", streams: 5 });
    const alphaLater = entity({ key: "a2", name: "alpha", streams: 5 });
    const alpha = entity({ key: "a", name: "Alpha", streams: 5 });
    const input = [beta, alphaLater, alpha];

    const once = sortEntities(input, "streams").map((row) => row.key);
    const twice = sortEntities(input, "streams").map((row) => row.key);

    expect(once).toEqual(["a", "a2", "b"]);
    expect(twice).toEqual(once);
  });

  // Numeric collation, so a number inside the name sorts by value.
  // Input: "Track 10" before "Track 2".
  // Expected: "Track 2", then "Track 10".
  it("orders Track 2 before Track 10", () => {
    const ten = entity({ key: "10", name: "Track 10" });
    const two = entity({ key: "2", name: "Track 2" });

    expect(sortEntities([ten, two], "alpha").map((row) => row.name)).toEqual([
      "Track 2",
      "Track 10",
    ]);
  });

  // The input array stays in place for a later page to reuse.
  // Input: Track 10, then Track 2.
  // Expected: a new array in alphabetical order, and the original order unchanged.
  it("returns a new array and does not change the input", () => {
    const ten = entity({ key: "10", name: "Track 10" });
    const two = entity({ key: "2", name: "Track 2" });
    const input = [ten, two];

    const sorted = sortEntities(input, "alpha");

    expect(sorted).not.toBe(input);
    expect(sorted.map((row) => row.name)).toEqual(["Track 2", "Track 10"]);
    expect(input.map((row) => row.name)).toEqual(["Track 10", "Track 2"]);
  });
});

describe("paginate", () => {
  // Page 2 continues the rank instead of starting over at 1.
  // Input: 250 rows, page 2, page size 100.
  // Expected: rows 101 through 200, with startRank 101.
  it("gives page 2 ranks 101 through 200", () => {
    const rows = Array.from({ length: 250 }, (_, index) =>
      entity({ key: String(index), name: `Artist ${index}` }),
    );

    const page = paginate(rows, 2, 100);
    const ranks = page.rows.map((_, index) => page.startRank + index);

    expect(page.page).toBe(2);
    expect(page.pageCount).toBe(3);
    expect(page.total).toBe(250);
    expect(page.rows).toHaveLength(100);
    expect(ranks[0]).toBe(101);
    expect(ranks[ranks.length - 1]).toBe(200);
    expect(page.rows[0]).toBe(rows[100]);
    expect(page.rows[99]).toBe(rows[199]);
  });

  // A page outside the list is pulled back in. No rows is still page 1 of 1.
  // Input: 250 rows with page 0 and page 50, then an empty list asking for page 4.
  // Expected: page 1, page 3, and one empty page.
  it("clamps the page and keeps an empty list on page 1", () => {
    const rows = Array.from({ length: 250 }, (_, index) =>
      entity({ key: String(index), name: `Artist ${index}` }),
    );

    expect(paginate(rows, 0, 100).page).toBe(1);
    expect(paginate(rows, 0, 100).startRank).toBe(1);
    expect(paginate(rows, 50, 100)).toMatchObject({
      page: 3,
      pageCount: 3,
      startRank: 201,
    });
    expect(paginate(rows, 50, 100).rows).toHaveLength(50);
    expect(paginate([], 4, 25)).toEqual({
      rows: [],
      page: 1,
      pageCount: 1,
      total: 0,
      startRank: 1,
    });
  });
});

describe("searchEntities", () => {
  // The query matches a name or a subtitle, ignoring case. A blank query does nothing.
  // Input: a song, an album by the same artist, and an unrelated row.
  // Expected: the Zeppelin rows for "zep", the song for "black", and the same array for a blank query.
  it("matches name or subtitle and leaves a blank query untouched", () => {
    const song = entity({
      key: "song",
      name: "Black Dog",
      subtitle: "Led Zeppelin \u2014 IV",
    });
    const album = entity({ key: "album", name: "IV", subtitle: "Led Zeppelin" });
    const other = entity({ key: "other", name: "Other Band", subtitle: null });
    const rows = [song, other, album];

    expect(searchEntities(rows, "  zep ").map((row) => row.key)).toEqual(["song", "album"]);
    expect(searchEntities(rows, "BLACK").map((row) => row.key)).toEqual(["song"]);
    expect(searchEntities(rows, "")).toBe(rows);
    expect(searchEntities(rows, "   ")).toBe(rows);
    expect(rows.map((row) => row.key)).toEqual(["song", "other", "album"]);
  });
});
