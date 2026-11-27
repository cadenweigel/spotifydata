/**
 * The graph query and the rules that keep it legal.
 * sanitizeQuery is the only place those rules are applied. Presets, saved
 * preferences, and controls all pass through it, so later code can assume
 * a legal query. Nothing here reads streams.
 */

import type { EntityKind } from "@/data/types";

export type TimeBucket = "day" | "week" | "month" | "year";

export type Breakdown =
  | "none"
  | "artist"
  | "album"
  | "track"
  | "platform"
  | "country"
  | "weekday"
  | "hour";

export type Measure = "streams" | "listenTime" | "uniqueArtists" | "uniqueTracks";

export type ChartType = "line" | "bar" | "area";

/** One chart request, after invalid fields have been replaced. */
export type GraphQuery = {
  measure: Measure;
  /** Null when the x-axis is categories rather than time. */
  timeBucket: TimeBucket | null;
  breakdown: Breakdown;
  /** Optional entity filter. At most 8, and only for artist, album, or track. */
  entityKeys: string[];
  chart: ChartType;
  /** Inclusive local day, YYYY-MM-DD. Null leaves that side open. */
  from: string | null;
  /** Inclusive local day, YYYY-MM-DD. Null leaves that side open. */
  to: string | null;
};

/** Series on a time chart, and the most entities a query may name. */
export const MAX_SERIES = 8;

/** Named bars on a category chart before the rest fold into Other. */
export const MAX_CATEGORIES = 15;

export const MEASURE_LABELS: Record<Measure, string> = {
  streams: "Streams",
  listenTime: "Listen time",
  uniqueArtists: "Unique artists",
  uniqueTracks: "Unique tracks",
};

const TIME_MEASURES: readonly Measure[] = [
  "streams",
  "listenTime",
  "uniqueArtists",
  "uniqueTracks",
];

const CATEGORY_MEASURES: readonly Measure[] = ["streams", "listenTime"];

const TIME_BUCKETS: readonly TimeBucket[] = ["day", "week", "month", "year"];

const BREAKDOWNS: readonly Breakdown[] = [
  "none",
  "artist",
  "album",
  "track",
  "platform",
  "country",
  "weekday",
  "hour",
];

const CHARTS: readonly ChartType[] = ["line", "bar", "area"];

const ENTITY_BREAKDOWNS: readonly EntityKind[] = ["artist", "album", "track"];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Measures a chart is allowed to plot.
 * Input is the time bucket, or null for a category chart.
 * Unique artists and unique tracks need a time bucket, because a single
 * bar has no period to count within. Streams and listen time are always available.
 */
export function availableMeasures(timeBucket: TimeBucket | null): readonly Measure[] {
  return timeBucket === null ? CATEGORY_MEASURES : TIME_MEASURES;
}

/** True for day, week, month, or year. */
export function isTimeBucket(value: unknown): value is TimeBucket {
  return typeof value === "string" && includes(TIME_BUCKETS, value);
}

/** True for one of the eight breakdowns. */
export function isBreakdown(value: unknown): value is Breakdown {
  return typeof value === "string" && includes(BREAKDOWNS, value);
}

/** True for one of the four measures, before the time-bucket rule is applied. */
export function isMeasure(value: unknown): value is Measure {
  return typeof value === "string" && includes(TIME_MEASURES, value);
}

/** True for line, bar, or area. */
export function isChartType(value: unknown): value is ChartType {
  return typeof value === "string" && includes(CHARTS, value);
}

/**
 * True when the breakdown groups artists, albums, or tracks.
 * Input is a breakdown. Platform, country, weekday, hour, and none are not
 * entities, so a query cannot filter them by entity key.
 */
export function isEntityBreakdown(value: Breakdown): value is EntityKind {
  return includes(ENTITY_BREAKDOWNS, value);
}

/**
 * Makes a query legal.
 * Input may be a query, a partial object from storage, or anything else.
 * An illegal breakdown becomes "none". An illegal measure, including a
 * unique count with no time bucket, becomes "streams". A category chart
 * is forced to bars. Entity keys are kept only for artist, album, and
 * track, de-duplicated, and cut to 8. A blank string is kept, because
 * that is the key for a missing artist. An inverted date range is swapped.
 * An unreadable date becomes null. The input is not changed.
 */
export function sanitizeQuery(input: unknown): GraphQuery {
  const raw = isPlainObject(input) ? input : {};
  const timeBucket = isTimeBucket(raw.timeBucket) ? raw.timeBucket : null;
  const measure = legalMeasure(raw.measure, timeBucket);
  const breakdown = isBreakdown(raw.breakdown) ? raw.breakdown : "none";
  const chart: ChartType =
    timeBucket === null ? "bar" : isChartType(raw.chart) ? raw.chart : "line";
  const entityKeys = isEntityBreakdown(breakdown) ? parseEntityKeys(raw.entityKeys) : [];
  const bounds = parseBounds(raw.from, raw.to);

  return {
    measure,
    timeBucket,
    breakdown,
    entityKeys,
    chart,
    from: bounds.from,
    to: bounds.to,
  };
}

/** A measure the bucket allows. Anything else becomes streams. */
function legalMeasure(value: unknown, timeBucket: TimeBucket | null): Measure {
  if (!isMeasure(value)) return "streams";
  return availableMeasures(timeBucket).includes(value) ? value : "streams";
}

/**
 * The first 8 distinct string keys, in the order they appear.
 * Non-strings are dropped. An empty string is kept.
 */
function parseEntityKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || seen.has(item)) continue;
    seen.add(item);
    keys.push(item);
    if (keys.length === MAX_SERIES) break;
  }
  return keys;
}

/**
 * A pair of inclusive local days.
 * Unreadable sides become null. When both days are real and from is after
 * to, the two are swapped so the range reads forward.
 */
function parseBounds(from: unknown, to: unknown): { from: string | null; to: string | null } {
  let start = isCalendarDay(from) ? from : null;
  let end = isCalendarDay(to) ? to : null;
  if (start !== null && end !== null && start > end) {
    const swapped = start;
    start = end;
    end = swapped;
  }
  return { from: start, to: end };
}

/** True for a real YYYY-MM-DD calendar day. February 31 is not one. */
function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includes<T extends string>(options: readonly T[], value: string): value is T {
  return options.some((option) => option === value);
}

/** The chart a bare Graphs visit opens on. */
export const LISTENING_OVER_TIME: GraphQuery = {
  measure: "listenTime",
  timeBucket: "month",
  breakdown: "none",
  entityKeys: [],
  chart: "area",
  from: null,
  to: null,
};

/**
 * A fresh copy of Listening over time.
 * Input is none. Callers can store the result without changing the preset.
 */
export function defaultGraphQuery(): GraphQuery {
  return { ...LISTENING_OVER_TIME, entityKeys: [] };
}

export type GraphPreset = {
  id: string;
  label: string;
  query: GraphQuery;
  /** The entity search takes focus when this preset is chosen. */
  focusEntitySearch?: boolean;
};

/**
 * The preset row, in the order the page shows the buttons.
 * One artist uses the same query as Top artists over time. Choosing it
 * focuses the search, and the page remembers which of the two was clicked.
 */
export const GRAPH_PRESETS: readonly GraphPreset[] = [
  { id: "listening", label: "Listening over time", query: defaultGraphQuery() },
  {
    id: "streams-year",
    label: "Streams per year",
    query: {
      measure: "streams",
      timeBucket: "year",
      breakdown: "none",
      entityKeys: [],
      chart: "bar",
      from: null,
      to: null,
    },
  },
  {
    id: "top-artists",
    label: "Top artists over time",
    query: {
      measure: "listenTime",
      timeBucket: "month",
      breakdown: "artist",
      entityKeys: [],
      chart: "line",
      from: null,
      to: null,
    },
  },
  {
    id: "hour",
    label: "Hour of day",
    query: {
      measure: "streams",
      timeBucket: null,
      breakdown: "hour",
      entityKeys: [],
      chart: "bar",
      from: null,
      to: null,
    },
  },
  {
    id: "weekday",
    label: "Weekday",
    query: {
      measure: "streams",
      timeBucket: null,
      breakdown: "weekday",
      entityKeys: [],
      chart: "bar",
      from: null,
      to: null,
    },
  },
  {
    id: "platform",
    label: "Platform",
    query: {
      measure: "listenTime",
      timeBucket: null,
      breakdown: "platform",
      entityKeys: [],
      chart: "bar",
      from: null,
      to: null,
    },
  },
  {
    id: "one-artist",
    label: "One artist",
    query: {
      measure: "listenTime",
      timeBucket: "month",
      breakdown: "artist",
      entityKeys: [],
      chart: "line",
      from: null,
      to: null,
    },
    focusEntitySearch: true,
  },
];

/**
 * True when both queries would draw the same chart.
 * Input is two queries. Entity key order matters. Dates matter.
 */
export function queriesEqual(a: GraphQuery, b: GraphQuery): boolean {
  if (
    a.measure !== b.measure ||
    a.timeBucket !== b.timeBucket ||
    a.breakdown !== b.breakdown ||
    a.chart !== b.chart ||
    a.from !== b.from ||
    a.to !== b.to ||
    a.entityKeys.length !== b.entityKeys.length
  ) {
    return false;
  }
  return a.entityKeys.every((key, index) => key === b.entityKeys[index]);
}

/**
 * The preset buttons whose query is exactly the current one.
 * Input is the current query. One artist and Top artists over time can
 * both match, because they share a query until an entity is chosen.
 */
export function matchingPresets(query: GraphQuery): GraphPreset[] {
  return GRAPH_PRESETS.filter((preset) => queriesEqual(preset.query, query));
}

/**
 * A saved graph query, or null when the measure or breakdown had to be repaired.
 * Input is the stored value. Entity keys are dropped, because they belong
 * to one dataset and go stale after another upload. A repaired measure or
 * breakdown returns null so the caller can use Listening over time instead
 * of a half-edited query. Chart, bucket, and dates may still be repaired.
 */
export function readStoredGraphQuery(input: unknown): GraphQuery | null {
  if (!isPlainObject(input)) return null;
  const sanitized = sanitizeQuery(input);
  const measureKept = isMeasure(input.measure) && input.measure === sanitized.measure;
  const breakdownKept = isBreakdown(input.breakdown) && input.breakdown === sanitized.breakdown;
  if (!measureKept || !breakdownKept) return null;
  return { ...sanitized, entityKeys: [] };
}
