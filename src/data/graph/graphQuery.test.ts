/**
 * Tests for the graph query rules. Inputs are plain objects, not saved
 * preferences or a URL.
 */

import { describe, expect, it } from "vitest";
import {
  availableMeasures,
  defaultGraphQuery,
  matchingPresets,
  queriesEqual,
  readStoredGraphQuery,
  sanitizeQuery,
  type GraphQuery,
} from "./graphQuery";

function query(overrides: Partial<GraphQuery> = {}): GraphQuery {
  return {
    measure: "listenTime",
    timeBucket: "month",
    breakdown: "none",
    entityKeys: [],
    chart: "area",
    from: null,
    to: null,
    ...overrides,
  };
}

describe("availableMeasures", () => {
  // A category chart has no period to count uniques inside.
  // Input: a null time bucket, then a month bucket.
  // Expected: streams and listen time only, then all four measures.
  it("hides unique counts when there is no time bucket", () => {
    expect(availableMeasures(null)).toEqual(["streams", "listenTime"]);
    expect(availableMeasures("month")).toEqual([
      "streams",
      "listenTime",
      "uniqueArtists",
      "uniqueTracks",
    ]);
  });
});

describe("sanitizeQuery", () => {
  // A unique measure needs a time bucket, and a category chart is bars.
  // Input: unique tracks, no time bucket, an area chart, and an inverted range.
  // Expected: streams, bars, and the days in calendar order.
  it("replaces an illegal measure and forces bars when time is off", () => {
    expect(
      sanitizeQuery({
        measure: "uniqueTracks",
        timeBucket: null,
        breakdown: "artist",
        chart: "area",
        entityKeys: ["a", "b"],
        from: "2024-05-01",
        to: "2024-01-01",
      }),
    ).toEqual({
      measure: "streams",
      timeBucket: null,
      breakdown: "artist",
      chart: "bar",
      entityKeys: ["a", "b"],
      from: "2024-01-01",
      to: "2024-05-01",
    });
  });

  // A real time chart keeps a unique measure and the chart the user asked for.
  // Input: unique artists, months, and a line chart.
  // Expected: those three fields unchanged.
  it("keeps a unique measure when a time bucket is set", () => {
    const sanitized = sanitizeQuery(
      query({ measure: "uniqueArtists", timeBucket: "month", chart: "line" }),
    );

    expect(sanitized.measure).toBe("uniqueArtists");
    expect(sanitized.timeBucket).toBe("month");
    expect(sanitized.chart).toBe("line");
  });

  // Unknown words become the plain replacements, not a guess at a preset.
  // Input: a decade bucket, a genre breakdown, a pie chart, and a bad measure.
  // Expected: no time bucket, breakdown none, streams, and a bar chart.
  it("replaces an illegal breakdown, measure, and chart", () => {
    expect(
      sanitizeQuery({
        measure: "plays",
        timeBucket: "decade",
        breakdown: "genre",
        chart: "pie",
      }),
    ).toMatchObject({
      measure: "streams",
      timeBucket: null,
      breakdown: "none",
      chart: "bar",
    });
  });

  // A bad chart on a real time query becomes a line. The time bucket stays.
  // Input: days, and a chart name this app does not draw.
  // Expected: day bucket and a line chart.
  it("uses a line chart when the time chart type is illegal", () => {
    expect(sanitizeQuery(query({ timeBucket: "day", chart: "pie" as GraphQuery["chart"] })).chart).toBe(
      "line",
    );
  });

  // Entity keys apply only to artist, album, and track.
  // Input: nine keys with a duplicate and a number, on an artist breakdown,
  // then the same keys on a weekday breakdown.
  // Expected: the first eight distinct strings, and an empty list for weekday.
  it("keeps at most eight entity keys and drops them for other breakdowns", () => {
    const keys = ["a", "a", "b", "c", "d", "e", "f", "g", "h", "i", 3];

    expect(sanitizeQuery(query({ breakdown: "artist", entityKeys: keys as string[] })).entityKeys).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
    ]);
    expect(sanitizeQuery(query({ breakdown: "weekday", entityKeys: ["a"] })).entityKeys).toEqual([]);
  });

  // A missing artist uses the empty string as its grouping key.
  // Input: one entity key, the empty string.
  // Expected: that key is still there.
  it("keeps a blank artist key", () => {
    expect(sanitizeQuery(query({ breakdown: "artist", entityKeys: [""] })).entityKeys).toEqual([""]);
  });

  // February 31 is not a day. The readable side stays.
  // Input: from 2024-02-31 and to 2024-03-01.
  // Expected: from null, to March 1.
  it("drops a date that is not a real calendar day", () => {
    expect(sanitizeQuery(query({ from: "2024-02-31", to: "2024-03-01" }))).toMatchObject({
      from: null,
      to: "2024-03-01",
    });
  });

  // Equal ends are a one-day range, not an inversion.
  // Input: from and to both 2024-04-04.
  // Expected: both days kept.
  it("keeps a range that starts and ends on the same day", () => {
    expect(sanitizeQuery(query({ from: "2024-04-04", to: "2024-04-04" }))).toMatchObject({
      from: "2024-04-04",
      to: "2024-04-04",
    });
  });

  // Anything that is not an object becomes the field-by-field fallback.
  // Input: null, then an array.
  // Expected: streams, no time bucket, breakdown none, bars, and open dates.
  it("replaces a non-object with a legal query", () => {
    const fallback: GraphQuery = {
      measure: "streams",
      timeBucket: null,
      breakdown: "none",
      entityKeys: [],
      chart: "bar",
      from: null,
      to: null,
    };

    expect(sanitizeQuery(null)).toEqual(fallback);
    expect(sanitizeQuery(["listenTime"])).toEqual(fallback);
  });

  // The caller's array is not rewritten when keys are removed.
  // Input: an artist query whose key list contains a duplicate.
  // Expected: the original array still has the duplicate.
  it("does not change the input", () => {
    const entityKeys = ["a", "a", "b"];
    sanitizeQuery(query({ breakdown: "artist", entityKeys }));

    expect(entityKeys).toEqual(["a", "a", "b"]);
  });

  // Running the sanitizer twice is the same as running it once.
  // Input: a mix of illegal fields, duplicate keys, and an inverted range.
  // Expected: the second result deep-equals the first.
  it("is idempotent", () => {
    const messy = {
      measure: "nope",
      timeBucket: "decade",
      breakdown: "genre",
      chart: "pie",
      entityKeys: ["a", "a", 1, "b"],
      from: "2024-12-01",
      to: "not-a-day",
    };

    const once = sanitizeQuery(messy);
    expect(sanitizeQuery(once)).toEqual(once);

    const illegalCombo = query({
      measure: "uniqueArtists",
      timeBucket: null,
      chart: "area",
      from: "2024-08-02",
      to: "2024-01-09",
    });
    const fixed = sanitizeQuery(illegalCombo);
    expect(sanitizeQuery(fixed)).toEqual(fixed);
  });
});

describe("readStoredGraphQuery", () => {
  // A saved unique count with no time bucket is not half-applied.
  // Input: unique artists, no time bucket, breakdown none.
  // Expected: null, so the caller uses Listening over time.
  it("rejects a measure the sanitizer had to replace", () => {
    expect(
      readStoredGraphQuery({
        measure: "uniqueArtists",
        timeBucket: null,
        breakdown: "none",
        chart: "bar",
        entityKeys: [],
        from: null,
        to: null,
      }),
    ).toBeNull();
  });

  // A legal chart is kept, and entity keys are not.
  // Input: streams per year with one artist key.
  // Expected: the year chart, with an empty key list.
  it("drops entity keys and keeps a legal chart", () => {
    expect(
      readStoredGraphQuery({
        measure: "streams",
        timeBucket: "year",
        breakdown: "none",
        chart: "bar",
        entityKeys: ["ada"],
        from: null,
        to: null,
      }),
    ).toEqual(query({ measure: "streams", timeBucket: "year", chart: "bar" }));
  });
});

describe("matchingPresets", () => {
  // One artist and Top artists share a query until an entity is chosen.
  // Input: the default top-artists query.
  // Expected: both presets, with Top artists first.
  it("returns both presets that share the top-artists query", () => {
    const matches = matchingPresets(
      query({ breakdown: "artist", chart: "line" }),
    );
    expect(matches.map((preset) => preset.id)).toEqual(["top-artists", "one-artist"]);
  });

  // The default query is Listening over time, and it matches that preset.
  // Input: defaultGraphQuery().
  // Expected: one match, listening, and it equals the default.
  it("matches Listening over time for the default query", () => {
    const matches = matchingPresets(defaultGraphQuery());
    expect(matches.map((preset) => preset.id)).toEqual(["listening"]);
    expect(matches[0] ? queriesEqual(matches[0].query, defaultGraphQuery()) : false).toBe(true);
  });
});
