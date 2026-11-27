/**
 * Turns a stream list and a query into chart points. No React, no Recharts.
 * Listen time stays in milliseconds. The chart converts it for display.
 * Time buckets are UTC (see buckets.ts). Hour and weekday categories are local.
 * Plays under the threshold, and podcasts when they are off, are removed
 * with filterStreams before any bucket or ranking.
 */

import type { EntityKind, EntityRow, Stream } from "@/data/types";
import { filterStreams, groupEntities } from "@/data/aggregate";
import { nameKey } from "@/data/names";
import {
  HOUR_KEYS,
  WEEKDAY_KEYS,
  bucketStart,
  fillTimeGaps,
  formatBucketLabel,
  hourLabel,
  localHour,
  localWeekday,
  resolveTimeBucket,
  weekdayLabel,
  type SeriesPoint,
} from "./buckets";
import {
  MAX_CATEGORIES,
  MAX_SERIES,
  MEASURE_LABELS,
  isEntityBreakdown,
  sanitizeQuery,
  type Breakdown,
  type GraphQuery,
  type Measure,
} from "./graphQuery";

export type GraphPoint = SeriesPoint;

/** The global listen settings. Dates come from the query. */
export type GraphScope = {
  /** Drop plays shorter than this. 0 keeps every length. */
  thresholdMs: number;
  /** When false, podcast rows are left out. */
  includePodcasts: boolean;
};

export type GraphResult = {
  points: GraphPoint[];
  /** Stable keys, in rank order. The chart maps these to colors. */
  seriesKeys: string[];
  seriesLabels: Record<string, string>;
  /** Display text for each point's x. Time labels use the UTC bucket date. */
  categoryLabels: Record<string, string>;
  /** Set when a day chart was drawn as weeks because the span was long. */
  truncatedFrom?: "day";
  /** The sentence that explains truncatedFrom. */
  notice?: string;
};

/**
 * Keys that are not entity names. A leading control character keeps them
 * off real artist, album, track, platform, and country keys.
 */
export const ALL_KEY = "\u0001all";
export const OTHER_KEY = "\u0001other";
export const UNKNOWN_KEY = "\u0001unknown";

export const ALL_LABEL = "All";
export const OTHER_LABEL = "Other";
export const UNKNOWN_LABEL = "Unknown";

type Ranked = {
  key: string;
  label: string;
  value: number;
};

type Cell = {
  streams: number;
  ms: number;
  artists: Set<string> | null;
  tracks: Set<string> | null;
};

type SeriesList = {
  keys: string[];
  labels: Record<string, string>;
  allowed: Set<string>;
};

const labelCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Builds the points for one query.
 * Input is the stream list, the query, and the listen settings. The query
 * is sanitized first. Dates, the threshold, and the podcast setting all go
 * through filterStreams. An empty result has no points.
 * Time charts put the bucket on x and one key per series. With no entities
 * chosen, a breakdown keeps the top 8 by the measure over the whole range.
 * Rows with a null album, country, or platform are left out of that top 8.
 * Category charts put the category on x. Artist, album, and track charts
 * keep the top 15 and fold the rest into Other. A null value on those
 * category charts is an Unknown bar, and it is not one of the 15.
 */
export function buildGraph(
  streams: readonly Stream[],
  queryInput: GraphQuery,
  scope: GraphScope,
): GraphResult {
  const query = sanitizeQuery(queryInput);
  const filtered = filterStreams(streams, {
    thresholdMs: scope.thresholdMs,
    includePodcasts: scope.includePodcasts,
    from: query.from,
    to: query.to,
  });
  const scoped = narrowToEntities(filtered, query);
  if (scoped.length === 0) return emptyResult();
  if (query.timeBucket === null) return buildCategory(scoped, query);
  return buildTime(scoped, query);
}

/**
 * The grouping key for one artist, album, or track.
 * Input is a stream and the kind. The key matches groupEntities, so a
 * chart and the Data table name the same row. A null album has no album
 * key. A track with a URI uses that URI.
 */
export function entityKey(stream: Stream, kind: EntityKind): string | null {
  if (kind === "artist") return nameKey(stream.artist);
  if (kind === "album") {
    if (stream.album === null) return null;
    return `${nameKey(stream.artist)}\u0000${nameKey(stream.album)}`;
  }
  if (stream.trackUri) return stream.trackUri;
  const artist = nameKey(stream.artist);
  const track = nameKey(stream.track);
  if (stream.album === null) return `${artist}\u0000${track}`;
  return `${artist}\u0000${track}\u0000${nameKey(stream.album)}`;
}

function emptyResult(): GraphResult {
  return { points: [], seriesKeys: [], seriesLabels: {}, categoryLabels: {} };
}

/** Keeps plays whose entity key was named. An empty list keeps every play. */
function narrowToEntities(streams: readonly Stream[], query: GraphQuery): readonly Stream[] {
  if (!isEntityBreakdown(query.breakdown) || query.entityKeys.length === 0) return streams;
  const wanted = new Set(query.entityKeys);
  const kept: Stream[] = [];
  for (const stream of streams) {
    const key = entityKey(stream, query.breakdown);
    if (key !== null && wanted.has(key)) kept.push(stream);
  }
  return kept;
}

function buildTime(streams: readonly Stream[], query: GraphQuery): GraphResult {
  const requested = query.timeBucket;
  if (requested === null) return emptyResult();

  const series = chooseSeries(streams, query);
  if (series.keys.length === 0) return emptyResult();

  const plotted = streamsInSeries(streams, query, series.allowed);
  if (plotted.length === 0) return emptyResult();

  const range = endedRange(plotted);
  const resolved = resolveTimeBucket(requested, range.first, range.last);
  const byBucket = new Map<string, Map<string, Cell>>();

  for (const stream of plotted) {
    const key = seriesKey(stream, query.breakdown, series.allowed);
    if (key === null) continue;
    const x = bucketStart(stream.endedAt, resolved.bucket);
    let row = byBucket.get(x);
    if (row === undefined) {
      row = new Map();
      byBucket.set(x, row);
    }
    let cell = row.get(key);
    if (cell === undefined) {
      cell = freshCell(query.measure);
      row.set(key, cell);
    }
    addPlay(cell, stream);
  }

  const sparse: GraphPoint[] = [];
  for (const [x, row] of byBucket) {
    const values: Record<string, number> = {};
    for (const key of series.keys) values[key] = readCell(row.get(key), query.measure);
    sparse.push({ x, series: values });
  }

  const points = fillTimeGaps(sparse, resolved.bucket, series.keys);
  const categoryLabels: Record<string, string> = {};
  for (const point of points) {
    categoryLabels[point.x] = formatBucketLabel(point.x, resolved.bucket);
  }

  const result: GraphResult = {
    points,
    seriesKeys: series.keys,
    seriesLabels: series.labels,
    categoryLabels,
  };
  if (resolved.notice !== null) {
    result.truncatedFrom = "day";
    result.notice = resolved.notice;
  }
  return result;
}

function buildCategory(streams: readonly Stream[], query: GraphQuery): GraphResult {
  switch (query.breakdown) {
    case "none":
      return categoryTotal(streams, query.measure);
    case "hour":
      return categoryFixed(
        streams,
        query.measure,
        HOUR_KEYS,
        (key) => hourLabel(Number(key)),
        (stream) => String(localHour(stream.endedAt)),
      );
    case "weekday":
      return categoryFixed(
        streams,
        query.measure,
        WEEKDAY_KEYS,
        weekdayLabel,
        (stream) => String(localWeekday(stream.endedAt)),
      );
    case "artist":
    case "album":
    case "track":
      return categoryEntities(streams, query, query.breakdown);
    case "platform":
    case "country":
      return categoryLoose(streams, query);
  }
}

function categoryTotal(streams: readonly Stream[], measure: Measure): GraphResult {
  let value = 0;
  for (const stream of streams) value += additive(stream, measure);
  return bars([{ key: ALL_KEY, label: ALL_LABEL, value }], measure);
}

function categoryFixed(
  streams: readonly Stream[],
  measure: Measure,
  keys: readonly string[],
  labelFor: (key: string) => string,
  keyFor: (stream: Stream) => string,
): GraphResult {
  const totals = new Map<string, number>();
  for (const key of keys) totals.set(key, 0);
  for (const stream of streams) {
    const key = keyFor(stream);
    totals.set(key, (totals.get(key) ?? 0) + additive(stream, measure));
  }
  return bars(
    keys.map((key) => ({ key, label: labelFor(key), value: totals.get(key) ?? 0 })),
    measure,
  );
}

/**
 * Top 15 named entities, then Other, then Unknown for null albums.
 * Chosen entity keys replace the top 15 and do not grow an Other bar.
 */
function categoryEntities(
  streams: readonly Stream[],
  query: GraphQuery,
  kind: EntityKind,
): GraphResult {
  if (query.entityKeys.length > 0) {
    return bars(rankPicked(streams, kind, query.entityKeys, query.measure), query.measure);
  }

  const ranked = rankEntities(streams, kind, query.measure);
  const extras: Ranked[] = [];
  const restValue = ranked
    .slice(MAX_CATEGORIES)
    .reduce((sum, item) => sum + item.value, 0);
  if (restValue > 0) extras.push({ key: OTHER_KEY, label: OTHER_LABEL, value: restValue });
  if (kind === "album") {
    const unknown = unknownAlbumValue(streams, query.measure);
    if (unknown > 0) extras.push({ key: UNKNOWN_KEY, label: UNKNOWN_LABEL, value: unknown });
  }
  return bars([...ranked.slice(0, MAX_CATEGORIES), ...extras], query.measure);
}

/**
 * Platform and country bars. A null value is Unknown and competes for a
 * place in the top 15. These charts have no Other bar.
 */
function categoryLoose(streams: readonly Stream[], query: GraphQuery): GraphResult {
  const totals = new Map<string, Ranked>();
  for (const stream of streams) {
    const item = looseCategory(stream, query.breakdown);
    const existing = totals.get(item.key);
    if (existing === undefined) {
      totals.set(item.key, { key: item.key, label: item.label, value: additive(stream, query.measure) });
    } else {
      existing.value += additive(stream, query.measure);
    }
  }
  const ranked = [...totals.values()].sort(compareRank);
  return bars(ranked.slice(0, MAX_CATEGORIES), query.measure);
}

function looseCategory(stream: Stream, breakdown: Breakdown): { key: string; label: string } {
  const value = breakdown === "country" ? stream.country : stream.platform;
  if (value === null) return { key: UNKNOWN_KEY, label: UNKNOWN_LABEL };
  return { key: value, label: value };
}

function unknownAlbumValue(streams: readonly Stream[], measure: Measure): number {
  let value = 0;
  for (const stream of streams) {
    if (stream.album !== null) continue;
    value += additive(stream, measure);
  }
  return value;
}

/**
 * Category charts only plot streams and listen time. sanitizeQuery replaces
 * a unique measure before this runs, so each play counts as one stream.
 */
function additive(stream: Stream, measure: Measure): number {
  if (measure === "listenTime") return stream.msPlayed;
  return 1;
}

function bars(ranked: readonly Ranked[], measure: Measure): GraphResult {
  if (ranked.length === 0) return emptyResult();
  const categoryLabels: Record<string, string> = {};
  const points: GraphPoint[] = [];
  for (const item of ranked) {
    categoryLabels[item.key] = item.label;
    points.push({ x: item.key, series: { [measure]: item.value } });
  }
  return {
    points,
    seriesKeys: [measure],
    seriesLabels: { [measure]: MEASURE_LABELS[measure] },
    categoryLabels,
  };
}

/**
 * The series a time chart draws, at most 8, highest measure first.
 * An empty entity list means the top 8 over the whole filtered range.
 * The control calls that "Top 8". Named entity keys are that list instead,
 * still ordered by the measure. A null breakdown value is not a series.
 */
function chooseSeries(streams: readonly Stream[], query: GraphQuery): SeriesList {
  if (query.breakdown === "none") {
    return {
      keys: [ALL_KEY],
      labels: { [ALL_KEY]: MEASURE_LABELS[query.measure] },
      allowed: new Set([ALL_KEY]),
    };
  }
  if (isEntityBreakdown(query.breakdown) && query.entityKeys.length > 0) {
    return toSeries(rankPicked(streams, query.breakdown, query.entityKeys, query.measure));
  }
  const ranked = isEntityBreakdown(query.breakdown)
    ? rankEntities(streams, query.breakdown, query.measure)
    : rankLoose(streams, query.breakdown, query.measure);
  return toSeries(ranked.slice(0, MAX_SERIES));
}

function toSeries(ranked: readonly Ranked[]): SeriesList {
  const labels: Record<string, string> = {};
  const keys: string[] = [];
  for (const item of ranked) {
    keys.push(item.key);
    labels[item.key] = item.label;
  }
  return { keys, labels, allowed: new Set(keys) };
}

function rankEntities(streams: readonly Stream[], kind: EntityKind, measure: Measure): Ranked[] {
  const ranked = groupEntities(streams, kind).map((row) => ({
    key: row.key,
    label: row.name,
    value: rowValue(row, kind, measure),
  }));
  ranked.sort(compareRank);
  return ranked;
}

function rankPicked(
  streams: readonly Stream[],
  kind: EntityKind,
  keys: readonly string[],
  measure: Measure,
): Ranked[] {
  const byKey = new Map(groupEntities(streams, kind).map((row) => [row.key, row]));
  const ranked = keys.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      label: row === undefined ? key : row.name,
      value: row === undefined ? 0 : rowValue(row, kind, measure),
    };
  });
  ranked.sort(compareRank);
  return ranked;
}

function rowValue(row: EntityRow, kind: EntityKind, measure: Measure): number {
  if (measure === "listenTime") return row.listenTimeMs;
  if (measure === "streams") return row.streams;
  if (measure === "uniqueArtists") return 1;
  if (kind === "track") return 1;
  return row.trackCount ?? 0;
}

/**
 * Full-range totals for a breakdown that is not an entity.
 * A null platform or country is skipped, so it cannot take a top-8 slot.
 */
function rankLoose(streams: readonly Stream[], breakdown: Breakdown, measure: Measure): Ranked[] {
  const cells = new Map<string, Cell>();
  const labels = new Map<string, string>();
  for (const stream of streams) {
    const key = breakdownKey(stream, breakdown);
    if (key === null) continue;
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = freshCell(measure);
      cells.set(key, cell);
      labels.set(key, looseLabel(breakdown, key));
    }
    addPlay(cell, stream);
  }
  const ranked = [...cells.entries()].map(([key, cell]) => ({
    key,
    label: labels.get(key) ?? key,
    value: readCell(cell, measure),
  }));
  ranked.sort(compareRank);
  return ranked;
}

function looseLabel(breakdown: Breakdown, key: string): string {
  if (breakdown === "weekday") return weekdayLabel(key);
  if (breakdown === "hour") return hourLabel(Number(key));
  return key;
}

function compareRank(a: Ranked, b: Ranked): number {
  if (a.value !== b.value) return b.value - a.value;
  const byLabel = labelCollator.compare(a.label, b.label);
  if (byLabel !== 0) return byLabel;
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

function streamsInSeries(
  streams: readonly Stream[],
  query: GraphQuery,
  allowed: ReadonlySet<string>,
): readonly Stream[] {
  if (query.breakdown === "none") return streams;
  const kept: Stream[] = [];
  for (const stream of streams) {
    const key = breakdownKey(stream, query.breakdown);
    if (key !== null && allowed.has(key)) kept.push(stream);
  }
  return kept;
}

function seriesKey(
  stream: Stream,
  breakdown: Breakdown,
  allowed: ReadonlySet<string>,
): string | null {
  if (breakdown === "none") return ALL_KEY;
  const key = breakdownKey(stream, breakdown);
  if (key === null || !allowed.has(key)) return null;
  return key;
}

function breakdownKey(stream: Stream, breakdown: Breakdown): string | null {
  switch (breakdown) {
    case "none":
      return ALL_KEY;
    case "artist":
      return entityKey(stream, "artist");
    case "album":
      return entityKey(stream, "album");
    case "track":
      return entityKey(stream, "track");
    case "platform":
      return stream.platform;
    case "country":
      return stream.country;
    case "weekday":
      return String(localWeekday(stream.endedAt));
    case "hour":
      return String(localHour(stream.endedAt));
  }
}

function freshCell(measure: Measure): Cell {
  return {
    streams: 0,
    ms: 0,
    artists: measure === "uniqueArtists" ? new Set() : null,
    tracks: measure === "uniqueTracks" ? new Set() : null,
  };
}

function addPlay(cell: Cell, stream: Stream): void {
  cell.streams += 1;
  cell.ms += stream.msPlayed;
  if (cell.artists !== null) cell.artists.add(nameKey(stream.artist));
  if (cell.tracks !== null) {
    const key = entityKey(stream, "track");
    if (key !== null) cell.tracks.add(key);
  }
}

function readCell(cell: Cell | undefined, measure: Measure): number {
  if (cell === undefined) return 0;
  if (measure === "listenTime") return cell.ms;
  if (measure === "uniqueArtists") return cell.artists === null ? 0 : cell.artists.size;
  if (measure === "uniqueTracks") return cell.tracks === null ? 0 : cell.tracks.size;
  return cell.streams;
}

function endedRange(streams: readonly Stream[]): { first: string; last: string } {
  let first = streams[0].endedAt;
  let last = streams[0].endedAt;
  let firstMs = Date.parse(first);
  let lastMs = Date.parse(last);
  for (let index = 1; index < streams.length; index++) {
    const endedAt = streams[index].endedAt;
    const ms = Date.parse(endedAt);
    if (ms < firstMs) {
      first = endedAt;
      firstMs = ms;
    }
    if (ms > lastMs) {
      last = endedAt;
      lastMs = ms;
    }
  }
  return { first, last };
}
