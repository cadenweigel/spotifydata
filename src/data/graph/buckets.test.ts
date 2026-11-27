/**
 * Tests for UTC buckets, local hour and weekday, and gap filling.
 * Instants written with a Z are UTC. Instants built with the local Date
 * constructor are the user's clock, which is what hour and weekday use.
 */

import { describe, expect, it } from "vitest";
import {
  bucketStart,
  fillTimeGaps,
  formatBucketLabel,
  hourLabel,
  localHour,
  localWeekday,
  resolveTimeBucket,
} from "./buckets";

const DAY_MS = 86_400_000;

function localIso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

describe("bucketStart", () => {
  // 2024-01-01 was a Monday. The 3rd is Wednesday and the 7th is Sunday.
  // Input: Wednesday, Sunday, and the next Monday, plus the Sunday before that Monday.
  // Expected: the first three share the Monday 2024-01-01, and the last is 2023-12-25.
  it("starts weeks on Monday UTC", () => {
    expect(bucketStart("2024-01-03T00:00:00.000Z", "week")).toBe("2024-01-01");
    expect(bucketStart("2024-01-07T23:00:00.000Z", "week")).toBe("2024-01-01");
    expect(bucketStart("2024-01-08T00:00:00.000Z", "week")).toBe("2024-01-08");
    expect(bucketStart("2023-12-31T12:00:00.000Z", "week")).toBe("2023-12-25");
  });

  // A leap day stays in February, and New Year's Eve stays in the old year.
  // Input: 2024-02-29 and both sides of the 2024 year boundary.
  // Expected: the leap day is 2024-02-29, month 2024-02, week 2024-02-26.
  // The year boundary splits 2023 from 2024.
  it("puts a leap day and a year boundary in the UTC bucket", () => {
    expect(bucketStart("2024-02-29T15:00:00.000Z", "day")).toBe("2024-02-29");
    expect(bucketStart("2024-02-29T15:00:00.000Z", "week")).toBe("2024-02-26");
    expect(bucketStart("2024-02-29T15:00:00.000Z", "month")).toBe("2024-02");
    expect(bucketStart("2024-02-29T15:00:00.000Z", "year")).toBe("2024");
    expect(bucketStart("2023-12-31T23:59:59.000Z", "year")).toBe("2023");
    expect(bucketStart("2024-01-01T01:00:00.000Z", "year")).toBe("2024");
    expect(bucketStart("2024-01-01T01:00:00.000Z", "day")).toBe("2024-01-01");
  });

  // An unreadable timestamp is a programmer error, not a stream to skip.
  // Input: the word "nope".
  // Expected: a throw that names the function and the bad value.
  it("throws when the timestamp cannot be read", () => {
    expect(() => bucketStart("nope", "day")).toThrow(/bucketStart expected an ISO timestamp/);
  });
});

describe("resolveTimeBucket", () => {
  // 5,000 UTC days stay daily. The next day steps up to weeks.
  // Input: 2010-01-01, then that instant plus 4,999 days, then plus 5,000 days.
  // Expected: day for the 5,000-day span, week and the long-range sentence for 5,001.
  it("steps a day chart up to weeks only past 5000 days", () => {
    const first = "2010-01-01T00:00:00.000Z";
    const origin = Date.parse(first);
    const at5000 = new Date(origin + 4999 * DAY_MS).toISOString();
    const at5001 = new Date(origin + 5000 * DAY_MS).toISOString();

    expect(resolveTimeBucket("day", first, at5000)).toEqual({ bucket: "day", notice: null });
    expect(resolveTimeBucket("day", first, at5001)).toEqual({
      bucket: "week",
      notice: "Showing weeks because this range is long",
    });
  });

  // Week and month requests are drawn as asked, however long the span is.
  // Input: a week request across the same 5,001-day span.
  // Expected: week, and no notice.
  it("leaves a week request on weeks", () => {
    const first = "2010-01-01T00:00:00.000Z";
    const last = new Date(Date.parse(first) + 5000 * DAY_MS).toISOString();

    expect(resolveTimeBucket("week", first, last)).toEqual({ bucket: "week", notice: null });
  });
});

describe("localHour and localWeekday", () => {
  // Hour and weekday follow the clock on the machine, not UTC.
  // Input: local midnight and 23:30 on a constructed local date.
  // Expected: hours 0 and 23. Monday is 0 and Sunday is 6.
  it("reads the hour and weekday in local time", () => {
    expect(localHour(localIso(2024, 6, 3, 0, 15))).toBe(0);
    expect(localHour(localIso(2024, 6, 3, 23, 45))).toBe(23);

    const monday = new Date(2024, 5, 1, 12, 0, 0, 0);
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() - 1);

    expect(localWeekday(monday.toISOString())).toBe(0);
    expect(localWeekday(sunday.toISOString())).toBe(6);
  });

  // A late local evening can already be the next UTC day. The hour stays local.
  // Input: 23:30 local, on a zone where that is not 23:30 UTC.
  // Expected: hour 23, which is not the UTC hour.
  it("keeps a late local hour when UTC has already moved on", () => {
    const date = new Date(2024, 5, 15, 23, 30, 0, 0);

    expect(localHour(date.toISOString())).toBe(23);
    if (date.getTimezoneOffset() !== 0) {
      expect(date.getUTCHours()).not.toBe(23);
    }
  });

  // The same split applies to the weekday. Week buckets stay Monday UTC.
  // Input: a local instant whose local weekday and UTC weekday differ.
  // Expected: the Monday-based local index, not the UTC one.
  it("uses the local weekday when it differs from the UTC day", () => {
    const split = findLocalUtcSplit();
    if (split === null) return;

    const localIndex = split.getDay() === 0 ? 6 : split.getDay() - 1;
    const utcIndex = split.getUTCDay() === 0 ? 6 : split.getUTCDay() - 1;
    expect(localWeekday(split.toISOString())).toBe(localIndex);
    expect(localWeekday(split.toISOString())).not.toBe(utcIndex);
  });
});

describe("hourLabel", () => {
  // Labels are the clock hour, ready for a category axis.
  // Input: midnight, noon, and 3 PM.
  // Expected: 12 AM, 12 PM, and 3 PM.
  it("labels hours on a 12-hour clock", () => {
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(12)).toBe("12 PM");
    expect(hourLabel(15)).toBe("3 PM");
  });
});

describe("formatBucketLabel", () => {
  // The label names the UTC calendar date, in the user's locale.
  // Input: the day key 2024-01-01, which is still December 31 locally in zones behind UTC.
  // Expected: the UTC formatting of that instant, and not the local formatting when they differ.
  it("formats the UTC bucket date in the user's locale", () => {
    const instant = new Date("2024-01-01T00:00:00.000Z");
    const utcLabel = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(instant);

    expect(formatBucketLabel("2024-01-01", "day")).toBe(utcLabel);
    expect(formatBucketLabel("2024-01-01", "week")).toBe(utcLabel);

    if (instant.getTimezoneOffset() !== 0) {
      const localLabel = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(instant);
      expect(formatBucketLabel("2024-01-01", "day")).not.toBe(localLabel);
    }
  });

  // Months use a short locale month and a two-digit year.
  // Input: 2024-01 and the year key 2024.
  // Expected: the short UTC month, a ’24 suffix, and the year unchanged.
  it("formats a month and a year", () => {
    const month = new Intl.DateTimeFormat(undefined, {
      month: "short",
      timeZone: "UTC",
    }).format(new Date("2024-01-01T00:00:00.000Z"));

    expect(formatBucketLabel("2024-01", "month")).toBe(`${month} ’24`);
    expect(formatBucketLabel("2024", "year")).toBe("2024");
  });
});

describe("fillTimeGaps", () => {
  // Empty buckets are real zeros so a line does not bridge them.
  // Input: January and March, with January split across two unsorted points.
  // Expected: January summed, February zero for every series, March present, nothing outside.
  it("inserts a zero bucket between distant points and sums duplicates", () => {
    const filled = fillTimeGaps(
      [
        { x: "2024-03", series: { a: 4 } },
        { x: "2024-01", series: { a: 2, b: 1 } },
        { x: "2024-01", series: { a: 3 } },
      ],
      "month",
      ["a", "b"],
    );

    expect(filled.map((point) => point.x)).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(filled[0].series).toEqual({ a: 5, b: 1 });
    expect(filled[1].series).toEqual({ a: 0, b: 0 });
    expect(filled[2].series).toEqual({ a: 4, b: 0 });
  });

  // A missing unique-count bucket is zero too. The filler does not special-case it.
  // Input: February 28 and March 1 in a leap year, one series.
  // Expected: February 29 sits between them with zero.
  it("inserts a zero for a missing bucket, including a leap day", () => {
    const filled = fillTimeGaps(
      [
        { x: "2024-02-28", series: { all: 1 } },
        { x: "2024-03-01", series: { all: 2 } },
      ],
      "day",
      ["all"],
    );

    expect(filled.map((point) => point.x)).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
    expect(filled[1].series.all).toBe(0);
  });

  // Week keys step seven days, from Monday to Monday.
  // Input: 2024-01-01 and 2024-01-15.
  // Expected: the Monday in between, with zero.
  it("fills the Mondays between two week buckets", () => {
    const filled = fillTimeGaps(
      [
        { x: "2024-01-01", series: { all: 1 } },
        { x: "2024-01-15", series: { all: 4 } },
      ],
      "week",
      ["all"],
    );

    expect(filled.map((point) => point.x)).toEqual(["2024-01-01", "2024-01-08", "2024-01-15"]);
    expect(filled[1].series.all).toBe(0);
  });

  // Nothing to span, so nothing is invented.
  // Input: an empty list, and a list of keys with no points.
  // Expected: an empty list both times.
  it("returns an empty list when there is nothing to fill", () => {
    expect(fillTimeGaps([], "month", ["a"])).toEqual([]);
    expect(fillTimeGaps([{ x: "2024-01", series: { a: 1 } }], "month", [])).toEqual([]);
  });
});

/** A local instant whose weekday is not the UTC weekday, or null in a UTC zone. */
function findLocalUtcSplit(): Date | null {
  for (let day = 0; day < 14; day++) {
    for (const hour of [0, 23]) {
      const date = new Date(2024, 0, 1 + day, hour, 30, 0, 0);
      if (date.getDay() !== date.getUTCDay()) return date;
    }
  }
  return null;
}
