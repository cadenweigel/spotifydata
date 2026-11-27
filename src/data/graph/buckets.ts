/**
 * Time buckets, and the local hour and weekday.
 *
 * Day, week, month, and year buckets are computed in UTC. A week starts
 * on Monday UTC. Labels are formatted from that UTC bucket start in the
 * user's locale: the month names follow the locale, and the calendar date
 * stays the bucket's UTC date.
 *
 * Tradeoff: a listen just before local midnight can end after UTC midnight
 * and land in the next UTC day. 2024-01-01T01:00:00Z is still New Year's
 * Eve evening in US Pacific, and its day bucket is 2024-01-01.
 *
 * Hour and weekday are local on purpose. "What time of day I listen" is a
 * local notion, so the Hour of day and Weekday presets use the user's
 * timezone. That choice is separate from the UTC week rule above.
 */

import type { TimeBucket } from "./graphQuery";

/** One x value and the number for each series at that x. */
export type SeriesPoint = {
  x: string;
  series: Record<string, number>;
};

/**
 * How many day buckets a chart may draw before it steps up to weeks.
 * The plan's cutoff is about 5,000. A span of exactly 5,000 days stays
 * daily. One day more is drawn as weeks.
 */
export const DAY_BUCKET_LIMIT = 5_000;

/** Shown when a day chart was stepped up to weeks. */
export const LONG_RANGE_NOTICE = "Showing weeks because this range is long";

/** Monday through Sunday. Index 0 is Monday, matching localWeekday. */
export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Category keys for Monday through Sunday, in that order. */
export const WEEKDAY_KEYS: readonly string[] = ["0", "1", "2", "3", "4", "5", "6"];

/** Category keys for midnight through 11 PM, in that order. */
export const HOUR_KEYS: readonly string[] = Array.from({ length: 24 }, (_, hour) => String(hour));

/** A guard so a bad key cannot loop forever while filling gaps. */
const MAX_FILLED_BUCKETS = 20_000;

const DAY_MS = 86_400_000;

/**
 * The start of the UTC bucket that contains an instant.
 * Input is an ISO timestamp and the bucket size. The result is YYYY-MM-DD
 * for a day or a week, YYYY-MM for a month, and YYYY for a year. Week
 * starts are Mondays. An unreadable timestamp throws.
 */
export function bucketStart(iso: string, bucket: TimeBucket): string {
  const date = parseInstant(iso, "bucketStart");
  if (bucket === "year") return String(date.getUTCFullYear());
  if (bucket === "month") return utcMonth(date);
  if (bucket === "day") return utcDay(date);
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysFromMonday),
  );
  return utcDay(monday);
}

/**
 * The bucket a time chart should draw.
 * Input is the requested bucket and the first and last instants that will
 * be plotted. A day request whose UTC days exceed the limit becomes weeks,
 * and the notice explains the change. Every other request is unchanged.
 */
export function resolveTimeBucket(
  bucket: TimeBucket,
  firstIso: string,
  lastIso: string,
): { bucket: TimeBucket; notice: string | null } {
  if (bucket !== "day") return { bucket, notice: null };
  if (inclusiveDaySpan(firstIso, lastIso) > DAY_BUCKET_LIMIT) {
    return { bucket: "week", notice: LONG_RANGE_NOTICE };
  }
  return { bucket, notice: null };
}

/**
 * Inserts a zero for every missing bucket between the first and last.
 * Input points may be sparse and unsorted. Values that share a bucket are
 * added. Each series key is present on every returned point, with 0 where
 * the input omitted it. A unique-count measure uses the same zeros: a month
 * with no plays has zero unique artists, not a hole a line would bridge.
 * An empty input stays empty. The points come back in time order.
 */
export function fillTimeGaps(
  points: readonly SeriesPoint[],
  bucket: TimeBucket,
  seriesKeys: readonly string[],
): SeriesPoint[] {
  if (points.length === 0 || seriesKeys.length === 0) return [];

  const merged = new Map<string, Record<string, number>>();
  for (const point of points) {
    if (!isTimeKey(point.x, bucket)) continue;
    let row = merged.get(point.x);
    if (row === undefined) {
      row = {};
      merged.set(point.x, row);
    }
    for (const key of seriesKeys) {
      row[key] = (row[key] ?? 0) + (point.series[key] ?? 0);
    }
  }
  if (merged.size === 0) return [];

  const present = [...merged.keys()].sort();
  const start = present[0];
  const end = present[present.length - 1];
  return eachBucket(start, end, bucket).map((x) => {
    const row = merged.get(x);
    const series: Record<string, number> = {};
    for (const key of seriesKeys) series[key] = row?.[key] ?? 0;
    return { x, series };
  });
}

/**
 * A display label for a UTC bucket key.
 * Input is the key from bucketStart and the bucket size. Month names and
 * day order follow the user's locale. The calendar date is the UTC date
 * of the bucket, so the label names the same day the stream was filed under.
 */
export function formatBucketLabel(key: string, bucket: TimeBucket): string {
  if (bucket === "year") return key;
  if (bucket === "month") return formatMonth(key);
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * The local hour a stream ended, 0 through 23.
 * Input is an ISO timestamp. This is the user's clock hour, not the UTC
 * hour. An unreadable timestamp throws.
 */
export function localHour(iso: string): number {
  return parseInstant(iso, "localHour").getHours();
}

/**
 * The local weekday a stream ended. 0 is Monday and 6 is Sunday.
 * Input is an ISO timestamp. The day is local, so it can differ from the
 * UTC day used by week buckets. An unreadable timestamp throws.
 */
export function localWeekday(iso: string): number {
  const day = parseInstant(iso, "localWeekday").getDay();
  return day === 0 ? 6 : day - 1;
}

/** Monday through Sunday for a weekday key. An unknown key is returned as itself. */
export function weekdayLabel(key: string): string {
  const index = Number(key);
  if (!Number.isInteger(index) || index < 0 || index > 6) return key;
  return WEEKDAY_LABELS[index];
}

/** A clock label for an hour 0 through 23, such as "12 AM" or "3 PM". */
export function hourLabel(hour: number): string {
  const clock = hour % 12 === 0 ? 12 : hour % 12;
  return `${clock} ${hour < 12 ? "AM" : "PM"}`;
}

function inclusiveDaySpan(firstIso: string, lastIso: string): number {
  const start = Date.parse(`${bucketStart(firstIso, "day")}T00:00:00.000Z`);
  const end = Date.parse(`${bucketStart(lastIso, "day")}T00:00:00.000Z`);
  return Math.round((end - start) / DAY_MS) + 1;
}

function eachBucket(start: string, end: string, bucket: TimeBucket): string[] {
  const keys: string[] = [];
  let current = start;
  while (keys.length < MAX_FILLED_BUCKETS) {
    keys.push(current);
    if (current === end) break;
    const next = nextBucket(current, bucket);
    if (next <= current) break;
    current = next;
  }
  return keys;
}

function nextBucket(key: string, bucket: TimeBucket): string {
  if (bucket === "year") return String(Number(key) + 1);
  if (bucket === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    if (!match) return key;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
    return utcMonth(date);
  }
  const step = bucket === "week" ? 7 : 1;
  return utcDay(new Date(Date.parse(`${key}T00:00:00.000Z`) + step * DAY_MS));
}

function formatMonth(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const year = Number(match[1]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, 1));
  const monthName = new Intl.DateTimeFormat(undefined, {
    month: "short",
    timeZone: "UTC",
  }).format(date);
  return `${monthName} ’${String(year).slice(2)}`;
}

function isTimeKey(key: string, bucket: TimeBucket): boolean {
  if (bucket === "year") return /^\d{4}$/.test(key);
  if (bucket === "month") return monthNumber(key) !== null;
  if (bucket === "week") {
    const date = utcDate(key);
    return date !== null && date.getUTCDay() === 1;
  }
  return utcDate(key) !== null;
}

function utcDate(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || utcDay(date) !== key) return null;
  return date;
}

function monthNumber(key: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return month;
}

function parseInstant(iso: string, name: string): Date {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`${name} expected an ISO timestamp, received "${iso}"`);
  }
  return new Date(ms);
}

function utcDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function utcMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
