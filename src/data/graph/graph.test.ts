/**
 * Tests for buildGraph. Streams are built here and are not from a Spotify
 * export. Day bounds in a query are local calendar days. Bucket assertions
 * use UTC instants, because day, week, month, and year buckets are UTC.
 */

import { describe, expect, it } from "vitest";
import type { Stream } from "@/data/types";
import { filterStreams, groupEntities } from "@/data/aggregate";
import { nameKey } from "@/data/names";
import {
  ALL_KEY,
  OTHER_KEY,
  UNKNOWN_KEY,
  buildGraph,
  entityKey,
  type GraphResult,
  type GraphScope,
} from "./graph";
import type { GraphQuery } from "./graphQuery";

const allPlays: GraphScope = { thresholdMs: 0, includePodcasts: true };

function stream(overrides: Partial<Stream> & Pick<Stream, "endedAt">): Stream {
  return {
    id: 0,
    msPlayed: 60_000,
    artist: "Artist",
    album: "Album",
    track: "Track",
    trackUri: null,
    isPodcast: false,
    platform: "Web Player",
    country: "US",
    reasonStart: null,
    reasonEnd: null,
    shuffle: null,
    skipped: null,
    offline: null,
    incognito: null,
    ...overrides,
  };
}

function query(overrides: Partial<GraphQuery> = {}): GraphQuery {
  return {
    measure: "streams",
    timeBucket: "month",
    breakdown: "none",
    entityKeys: [],
    chart: "line",
    from: null,
    to: null,
    ...overrides,
  };
}

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
}

function sumSeries(result: GraphResult): number {
  let sum = 0;
  for (const point of result.points) {
    for (const key of result.seriesKeys) sum += point.series[key] ?? 0;
  }
  return sum;
}

describe("buildGraph", () => {
  // Monthly listen time matches the artist table for the same filter.
  // Input: four kept plays across three months, one play under 30s, and one podcast.
  // The scope counts 30s and up and leaves podcasts out.
  // Expected: 195000 ms, from both the month total and the artist series.
  it("sums monthly listen time to the grouped total for the same filter", () => {
    const streams = [
      stream({ artist: "Alpha", msPlayed: 60_000, endedAt: "2024-01-15T12:00:00.000Z" }),
      stream({ artist: "Alpha", msPlayed: 30_000, endedAt: "2024-02-10T12:00:00.000Z" }),
      stream({ artist: "Beta", msPlayed: 60_000, endedAt: "2024-02-11T12:00:00.000Z" }),
      stream({ artist: "Beta", msPlayed: 10_000, endedAt: "2024-02-12T12:00:00.000Z" }),
      stream({
        artist: "Show",
        msPlayed: 120_000,
        isPodcast: true,
        endedAt: "2024-03-05T12:00:00.000Z",
      }),
      stream({ artist: "Alpha", msPlayed: 45_000, endedAt: "2024-03-20T12:00:00.000Z" }),
    ];
    const scope: GraphScope = { thresholdMs: 30_000, includePodcasts: false };
    const filtered = filterStreams(streams, { ...scope, from: null, to: null });
    const expected = groupEntities(filtered, "artist").reduce((sum, row) => sum + row.listenTimeMs, 0);

    const byMonth = buildGraph(
      streams,
      query({ measure: "listenTime", timeBucket: "month", breakdown: "none" }),
      scope,
    );
    const byArtist = buildGraph(
      streams,
      query({ measure: "listenTime", timeBucket: "month", breakdown: "artist" }),
      scope,
    );

    expect(filtered).toHaveLength(4);
    expect(expected).toBe(195_000);
    expect(sumSeries(byMonth)).toBe(expected);
    expect(sumSeries(byArtist)).toBe(expected);
    expect(byMonth.seriesKeys).toEqual([ALL_KEY]);
    expect(byMonth.seriesLabels[ALL_KEY]).toBe("Listen time");
    expect(byArtist.seriesKeys).toHaveLength(2);
  });

  // An empty span is a hole with a zero, not a line jumping the gap.
  // Input: one play in January and one in March.
  // Expected: February is present and zero, and the two plays still sum to 2.
  it("inserts a zero month between two distant streams", () => {
    const streams = [
      stream({ endedAt: "2024-01-15T12:00:00.000Z", track: "Jan" }),
      stream({ endedAt: "2024-03-15T12:00:00.000Z", track: "Mar" }),
    ];
    const result = buildGraph(streams, query({ timeBucket: "month" }), allPlays);

    expect(result.points.map((point) => point.x)).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(result.points[1].series[ALL_KEY]).toBe(0);
    expect(sumSeries(result)).toBe(2);
  });

  // Each artist counts once in a month, however many times they played.
  // Input: Alpha twice in January, Beta once in January, Alpha once in March.
  // Expected: January 2, February 0, March 1.
  it("counts unique artists once per month", () => {
    const streams = [
      stream({ artist: "Alpha", endedAt: "2024-01-05T12:00:00.000Z", track: "One" }),
      stream({ artist: "Alpha", endedAt: "2024-01-06T12:00:00.000Z", track: "Two" }),
      stream({ artist: "Beta", endedAt: "2024-01-07T12:00:00.000Z", track: "Three" }),
      stream({ artist: "Alpha", endedAt: "2024-03-02T12:00:00.000Z", track: "Four" }),
    ];
    const result = buildGraph(
      streams,
      query({ measure: "uniqueArtists", timeBucket: "month", breakdown: "none" }),
      allPlays,
    );

    expect(result.points.map((point) => point.x)).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(result.points.map((point) => point.series[ALL_KEY])).toEqual([2, 0, 1]);
  });

  // Nine artists and no picked keys still draw eight series.
  // Input: Artist 1 through Artist 9, with that many plays each.
  // Expected: eight series, Artist 9 first, Artist 1 absent.
  it("caps an unpicked breakdown at the top 8", () => {
    const streams: Stream[] = [];
    for (let count = 1; count <= 9; count++) {
      for (let play = 0; play < count; play++) {
        streams.push(
          stream({
            artist: `Artist ${count}`,
            track: `T${count}-${play}`,
            endedAt: `2024-01-${String(play + 1).padStart(2, "0")}T12:00:00.000Z`,
          }),
        );
      }
    }

    const result = buildGraph(streams, query({ breakdown: "artist" }), allPlays);

    expect(result.seriesKeys).toHaveLength(8);
    expect(result.seriesKeys[0]).toBe(nameKey("Artist 9"));
    expect(result.seriesKeys).not.toContain(nameKey("Artist 1"));
  });

  // Named keys are a filter, ordered by the measure, and the ninth name is cut.
  // Input: keys for Artist 1 through Artist 9, who have that many plays.
  // Expected: Artist 9 is dropped, Artist 8 leads, and a two-key filter sums only those two.
  it("plots the named entities and drops a ninth key", () => {
    const streams: Stream[] = [];
    const keys: string[] = [];
    for (let count = 1; count <= 9; count++) {
      const artist = `Artist ${count}`;
      keys.push(nameKey(artist));
      for (let play = 0; play < count; play++) {
        streams.push(
          stream({
            artist,
            track: `T${count}-${play}`,
            endedAt: `2024-01-${String(play + 1).padStart(2, "0")}T12:00:00.000Z`,
          }),
        );
      }
    }

    const capped = buildGraph(streams, query({ breakdown: "artist", entityKeys: keys }), allPlays);
    expect(capped.seriesKeys).toHaveLength(8);
    expect(capped.seriesKeys[0]).toBe(nameKey("Artist 8"));
    expect(capped.seriesKeys).not.toContain(nameKey("Artist 9"));

    const picked = buildGraph(
      streams,
      query({
        breakdown: "artist",
        entityKeys: [nameKey("Artist 1"), nameKey("Artist 9")],
      }),
      allPlays,
    );
    expect(picked.seriesKeys).toEqual([nameKey("Artist 9"), nameKey("Artist 1")]);
    expect(sumSeries(picked)).toBe(10);
  });

  // Hour as a time series is still capped. The 24-hour axis is the category chart.
  // Input: one play in each local hour of one day.
  // Expected: eight series, not twenty-four.
  it("caps an hour time series at 8", () => {
    const streams = Array.from({ length: 24 }, (_, hour) =>
      stream({
        endedAt: localIso(2024, 1, 15, hour),
        track: `H${hour}`,
      }),
    );

    const result = buildGraph(streams, query({ timeBucket: "month", breakdown: "hour" }), allPlays);

    expect(result.seriesKeys).toHaveLength(8);
  });

  // A category hour chart always has midnight through 11 PM, zeros included.
  // Input: one play at local 3 PM.
  // Expected: 24 bars, hour 15 is 1, midnight is 0, labels 3 PM and 12 AM.
  it("returns 24 hour bars in order", () => {
    const result = buildGraph(
      [stream({ endedAt: localIso(2024, 1, 15, 15), track: "Afternoon" })],
      query({ timeBucket: null, breakdown: "hour", chart: "bar" }),
      allPlays,
    );

    expect(result.points.map((point) => point.x)).toEqual(
      Array.from({ length: 24 }, (_, hour) => String(hour)),
    );
    expect(result.points[15].series.streams).toBe(1);
    expect(result.points[0].series.streams).toBe(0);
    expect(result.categoryLabels["15"]).toBe("3 PM");
    expect(result.categoryLabels["0"]).toBe("12 AM");
  });

  // Weekday bars run Monday through Sunday even when only Monday has a play.
  // Input: one play on a local Monday.
  // Expected: seven bars, Monday first with 1, Sunday last with 0.
  it("returns seven weekday bars from Monday through Sunday", () => {
    const monday = new Date(2024, 5, 1, 12, 0, 0, 0);
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);

    const result = buildGraph(
      [stream({ endedAt: monday.toISOString(), track: "Monday" })],
      query({ timeBucket: null, breakdown: "weekday", chart: "bar" }),
      allPlays,
    );

    expect(result.points).toHaveLength(7);
    expect(result.points.map((point) => result.categoryLabels[point.x])).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(result.points[0].series.streams).toBe(1);
    expect(result.points[6].series.streams).toBe(0);
  });

  // Other is the plays past the top 15. Artists do not grow an Unknown bar.
  // Input: sixteen artists with one play each.
  // Expected: fifteen bars, and Other equal to the grouped total minus those bars.
  it("folds artists past the top 15 into Other", () => {
    const streams = Array.from({ length: 16 }, (_, index) =>
      stream({
        artist: `Artist ${String(index).padStart(2, "0")}`,
        track: `T${index}`,
        endedAt: "2024-04-02T12:00:00.000Z",
      }),
    );
    const result = buildGraph(
      streams,
      query({ timeBucket: null, breakdown: "artist", chart: "bar" }),
      allPlays,
    );
    const total = groupEntities(streams, "artist").reduce((sum, row) => sum + row.streams, 0);
    const other = result.points.find((point) => point.x === OTHER_KEY);
    const named = result.points.filter((point) => point.x !== OTHER_KEY);
    const namedSum = named.reduce((sum, point) => sum + (point.series.streams ?? 0), 0);

    expect(named).toHaveLength(15);
    expect(other?.series.streams).toBe(total - namedSum);
    expect(result.points.some((point) => point.x === UNKNOWN_KEY)).toBe(false);
    expect(result.categoryLabels[OTHER_KEY]).toBe("Other");
  });

  // A blank artist keeps the table's key and label. It is not the Unknown bar.
  // Input: one play with a whitespace artist name, and one named artist.
  // Expected: the empty key labeled Unknown artist, and no Unknown bar.
  it("labels a blank artist as Unknown artist", () => {
    const result = buildGraph(
      [
        stream({ artist: "   ", track: "Blank", endedAt: "2024-04-01T12:00:00.000Z" }),
        stream({ artist: "Real", track: "Song", endedAt: "2024-04-02T12:00:00.000Z" }),
      ],
      query({ timeBucket: null, breakdown: "artist", chart: "bar" }),
      allPlays,
    );

    expect(result.categoryLabels[""]).toBe("Unknown artist");
    expect(result.points.some((point) => point.x === "")).toBe(true);
    expect(result.points.some((point) => point.x === UNKNOWN_KEY)).toBe(false);
  });

  // A null album is Unknown on a category chart, and it is not one of the 15.
  // Input: sixteen named albums and one play with no album.
  // Expected: fifteen bars, Other of 1, and Unknown of 1.
  it("groups a null album as Unknown and keeps it out of the top 15", () => {
    const streams = [
      ...Array.from({ length: 16 }, (_, index) =>
        stream({
          artist: "Band",
          album: `Album ${String(index).padStart(2, "0")}`,
          track: `T${index}`,
          endedAt: "2024-05-01T12:00:00.000Z",
        }),
      ),
      stream({
        artist: "Band",
        album: null,
        track: "Local",
        endedAt: "2024-05-02T12:00:00.000Z",
      }),
    ];
    const result = buildGraph(
      streams,
      query({ timeBucket: null, breakdown: "album", chart: "bar" }),
      allPlays,
    );
    const other = result.points.find((point) => point.x === OTHER_KEY);
    const unknown = result.points.find((point) => point.x === UNKNOWN_KEY);
    const namedSum = result.points
      .filter((point) => point.x !== OTHER_KEY && point.x !== UNKNOWN_KEY)
      .reduce((sum, point) => sum + (point.series.streams ?? 0), 0);

    expect(result.points).toHaveLength(17);
    expect(namedSum).toBe(15);
    expect(other?.series.streams).toBe(1);
    expect(unknown?.series.streams).toBe(1);
    expect(result.categoryLabels[UNKNOWN_KEY]).toBe("Unknown");
  });

  // A null album is left out of the top albums over time, even when it is the largest.
  // Input: nine named albums in March and forty plays with no album in April.
  // Expected: eight series, all of them March, summing to 8.
  it("leaves a null album out of the top albums over time", () => {
    const streams: Stream[] = [];
    for (let index = 0; index < 9; index++) {
      streams.push(
        stream({
          artist: "Band",
          album: `Album ${index}`,
          track: `T${index}`,
          endedAt: "2024-03-01T12:00:00.000Z",
        }),
      );
    }
    for (let index = 0; index < 40; index++) {
      streams.push(
        stream({
          artist: "Band",
          album: null,
          track: `Local ${index}`,
          endedAt: "2024-04-01T12:00:00.000Z",
        }),
      );
    }

    const result = buildGraph(streams, query({ breakdown: "album" }), allPlays);

    expect(result.seriesKeys).toHaveLength(8);
    expect(result.seriesKeys).not.toContain(UNKNOWN_KEY);
    expect(result.points.map((point) => point.x)).toEqual(["2024-03"]);
    expect(sumSeries(result)).toBe(8);
  });

  // Platform and country category charts show a null as Unknown.
  // Input: one known value and one null, for each breakdown.
  // Expected: an Unknown bar with 1, and no Other bar.
  it("groups a null platform and a null country as Unknown", () => {
    const streams = [
      stream({ platform: "iOS", country: "US", endedAt: "2024-06-01T12:00:00.000Z", track: "A" }),
      stream({
        platform: null,
        country: null,
        endedAt: "2024-06-02T12:00:00.000Z",
        track: "B",
      }),
    ];

    const byPlatform = buildGraph(
      streams,
      query({ timeBucket: null, breakdown: "platform", chart: "bar" }),
      allPlays,
    );
    const byCountry = buildGraph(
      streams,
      query({ timeBucket: null, breakdown: "country", chart: "bar" }),
      allPlays,
    );

    expect(byPlatform.categoryLabels[UNKNOWN_KEY]).toBe("Unknown");
    expect(byPlatform.points.find((point) => point.x === UNKNOWN_KEY)?.series.streams).toBe(1);
    expect(byPlatform.points.some((point) => point.x === OTHER_KEY)).toBe(false);
    expect(byCountry.categoryLabels[UNKNOWN_KEY]).toBe("Unknown");
    expect(byCountry.points.find((point) => point.x === "US")?.series.streams).toBe(1);
  });

  // Over time, a null platform or country does not become a series or stretch the axis.
  // Input: one iOS play in January and one play with neither field in June.
  // Expected: a single January series for the known value.
  it("leaves a null platform and country out of a time series", () => {
    const streams = [
      stream({ platform: "iOS", country: "US", endedAt: "2024-01-15T12:00:00.000Z", track: "A" }),
      stream({ platform: null, country: null, endedAt: "2024-06-01T12:00:00.000Z", track: "B" }),
    ];

    const byPlatform = buildGraph(streams, query({ breakdown: "platform" }), allPlays);
    const byCountry = buildGraph(streams, query({ breakdown: "country" }), allPlays);

    expect(byPlatform.seriesKeys).toEqual(["iOS"]);
    expect(byPlatform.points.map((point) => point.x)).toEqual(["2024-01"]);
    expect(byCountry.seriesKeys).toEqual(["US"]);
    expect(sumSeries(byCountry)).toBe(1);
  });

  // Platform bars stop at 15 and do not add Other.
  // Input: sixteen platforms, one play each.
  // Expected: fifteen bars and no Other key.
  it("omits Other on a platform chart", () => {
    const streams = Array.from({ length: 16 }, (_, index) =>
      stream({
        platform: `Platform ${String(index).padStart(2, "0")}`,
        track: `T${index}`,
        endedAt: "2024-07-01T12:00:00.000Z",
      }),
    );
    const result = buildGraph(
      streams,
      query({ timeBucket: null, breakdown: "platform", chart: "bar" }),
      allPlays,
    );

    expect(result.points).toHaveLength(15);
    expect(result.points.some((point) => point.x === OTHER_KEY)).toBe(false);
  });

  // The chart key is the grouping key. The label keeps the display casing.
  // Input: a messy artist and album name, a URI track, and a local track.
  // Expected: entityKey matches groupEntities, and the bar label is the display name.
  it("uses the same entity keys as the tables", () => {
    const messy = stream({
      artist: "  Led   Zeppelin  ",
      album: "  IV ",
      track: "  Black   Dog ",
      trackUri: null,
      endedAt: "2024-05-01T12:00:00.000Z",
    });
    const withUri = stream({
      artist: "Led Zeppelin",
      album: "IV",
      track: "Rock and Roll",
      trackUri: "spotify:track:abc",
      endedAt: "2024-05-02T12:00:00.000Z",
    });
    const streams = [messy, withUri];

    expect(entityKey(messy, "artist")).toBe(groupEntities(streams, "artist")[0].key);
    expect(groupEntities([messy], "album").map((row) => row.key)).toEqual([entityKey(messy, "album")]);
    expect(groupEntities(streams, "track").map((row) => row.key).sort()).toEqual(
      [entityKey(messy, "track"), entityKey(withUri, "track")].sort(),
    );

    const chart = buildGraph(
      [messy],
      query({ timeBucket: null, breakdown: "artist", chart: "bar" }),
      allPlays,
    );
    const artistKey = nameKey("Led Zeppelin");
    expect(chart.points.map((point) => point.x)).toEqual([artistKey]);
    expect(chart.categoryLabels[artistKey]).toBe("Led Zeppelin");
  });

  // A leap day and the year boundary use the UTC bucket, not the local date.
  // Input: 2023-12-31T23:00Z, 2024-01-01T01:00Z, and 2024-02-29T15:00Z.
  // Expected: years 2023 and 2024, week Monday 2024-02-26, and day 2024-02-29.
  it("buckets a leap day and a year boundary in UTC", () => {
    const eve = stream({ endedAt: "2023-12-31T23:00:00.000Z", track: "Eve" });
    const next = stream({ endedAt: "2024-01-01T01:00:00.000Z", track: "Next" });
    const leap = stream({ endedAt: "2024-02-29T15:00:00.000Z", track: "Leap" });

    const years = buildGraph([eve, next], query({ timeBucket: "year" }), allPlays);
    expect(years.points.map((point) => point.x)).toEqual(["2023", "2024"]);

    const week = buildGraph([leap], query({ timeBucket: "week" }), allPlays);
    expect(week.points.map((point) => point.x)).toEqual(["2024-02-26"]);

    const day = buildGraph([leap], query({ timeBucket: "day" }), allPlays);
    expect(day.points.map((point) => point.x)).toEqual(["2024-02-29"]);
  });

  // A span past 5,000 days is drawn as weeks, with the sentence for the user.
  // Input: two plays 5,001 UTC days apart, asked for as days.
  // Expected: Monday week keys, the notice, and both plays still counted.
  it("steps a long day chart up to weeks", () => {
    const origin = Date.parse("2010-01-01T00:00:00.000Z");
    const streams = [
      stream({ endedAt: "2010-01-01T12:00:00.000Z", track: "Start" }),
      stream({
        endedAt: new Date(origin + 5000 * 86_400_000 + 12 * 3_600_000).toISOString(),
        track: "End",
      }),
    ];
    const result = buildGraph(streams, query({ timeBucket: "day" }), allPlays);

    expect(result.truncatedFrom).toBe("day");
    expect(result.notice).toBe("Showing weeks because this range is long");
    expect(result.points.length).toBeGreaterThan(700);
    expect(result.points.length).toBeLessThan(800);
    for (const point of result.points) {
      expect(new Date(`${point.x}T00:00:00.000Z`).getUTCDay()).toBe(1);
    }
    expect(sumSeries(result)).toBe(2);
  });

  // An inverted range is swapped, so both local days count.
  // Input: a January play and a May play, with from in May and to in January.
  // Expected: both plays.
  it("counts plays in a range whose ends were reversed", () => {
    const streams = [
      stream({ endedAt: localIso(2024, 1, 15), track: "Jan" }),
      stream({ endedAt: localIso(2024, 5, 15), track: "May" }),
    ];
    const result = buildGraph(
      streams,
      query({
        timeBucket: "year",
        from: "2024-05-20",
        to: "2024-01-01",
      }),
      allPlays,
    );

    expect(sumSeries(result)).toBe(2);
  });

  // A unique measure with no time bucket is plotted as streams.
  // Input: three plays by one artist, measure unique artists, time off.
  // Expected: one bar of 3, and no throw.
  it("plots an illegal unique measure as streams", () => {
    const streams = [
      stream({ artist: "Alpha", endedAt: "2024-01-01T12:00:00.000Z", track: "One" }),
      stream({ artist: "Alpha", endedAt: "2024-01-02T12:00:00.000Z", track: "Two" }),
      stream({ artist: "Alpha", endedAt: "2024-01-03T12:00:00.000Z", track: "Three" }),
    ];
    const result = buildGraph(
      streams,
      query({ measure: "uniqueArtists", timeBucket: null, breakdown: "artist", chart: "area" }),
      allPlays,
    );

    expect(result.seriesKeys).toEqual(["streams"]);
    expect(result.points).toHaveLength(1);
    expect(result.points[0].series.streams).toBe(3);
  });

  // No plays, or none that pass the settings, produce no points.
  // Input: an empty list, then one play under the threshold.
  // Expected: an empty point list both times.
  it("returns no points when nothing passes the filter", () => {
    expect(buildGraph([], query(), allPlays).points).toEqual([]);
    const short = stream({ msPlayed: 1_000, endedAt: "2024-01-01T12:00:00.000Z" });
    const result = buildGraph([short], query(), { thresholdMs: 30_000, includePodcasts: true });
    expect(result.points).toEqual([]);
  });
});
