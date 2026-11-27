/**
 * Search params for the Graphs page. No React.
 * parseGraphParams reads a URL and fills in a legal query. serializeGraphParams
 * writes every field that is needed to draw that query again. Entity keys
 * are repeated `e` params so a comma inside a name stays one key.
 */

import type { DatasetMeta } from "@/data/types";
import { datasetDateRange, type DayRange } from "@/data/dataParams";
import { sanitizeQuery, type GraphQuery, type TimeBucket } from "./graphQuery";

/**
 * Reads the Graphs page params.
 * Input is the query string and, when a dataset is loaded, its summary.
 * The result is passed through sanitizeQuery. Days outside the dataset
 * are pulled in, and a day that then sits on the dataset edge is stored
 * as null. This does not throw.
 */
export function parseGraphParams(
  searchParams: URLSearchParams,
  meta?: Pick<DatasetMeta, "minEndedAt" | "maxEndedAt">,
): GraphQuery {
  const query = sanitizeQuery({
    measure: searchParams.get("m"),
    timeBucket: timeFromParam(searchParams.get("t")),
    breakdown: searchParams.get("b"),
    chart: searchParams.get("c"),
    entityKeys: searchParams.getAll("e"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (meta === undefined) return query;
  return clampDates(query, datasetDateRange(meta));
}

/**
 * Writes the Graphs page params.
 * Input is a query. It is sanitized first. `t` is `none` when the chart
 * is not over time. Each entity key is its own `e` param. Open date sides
 * are left out.
 */
export function serializeGraphParams(query: GraphQuery): URLSearchParams {
  const legal = sanitizeQuery(query);
  const params = new URLSearchParams();
  params.set("m", legal.measure);
  params.set("t", legal.timeBucket ?? "none");
  params.set("b", legal.breakdown);
  params.set("c", legal.chart);
  for (const key of legal.entityKeys) params.append("e", key);
  if (legal.from !== null) params.set("from", legal.from);
  if (legal.to !== null) params.set("to", legal.to);
  return params;
}

/**
 * True when both query strings carry the same params, including repeated keys.
 * Input is two query strings. Key order does not matter. The order of a
 * repeated key does.
 */
export function graphParamsMatch(a: URLSearchParams, b: URLSearchParams): boolean {
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const left = a.getAll(key);
    const right = b.getAll(key);
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) return false;
    }
  }
  return true;
}

/**
 * A stable string for one query. Equal queries produce the same string.
 * Input is a query. It is sanitized first, so an illegal query shares a
 * key with the chart it will actually draw.
 */
export function graphQueryKey(query: GraphQuery): string {
  const legal = sanitizeQuery(query);
  return JSON.stringify([
    legal.measure,
    legal.timeBucket,
    legal.breakdown,
    legal.chart,
    legal.from,
    legal.to,
    legal.entityKeys,
  ]);
}

/**
 * The query a graphQueryKey string describes.
 * Input is the string from graphQueryKey. A string that is not that shape
 * becomes the same fallback sanitizeQuery uses for a blank query.
 */
export function queryFromKey(key: string): GraphQuery {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    return sanitizeQuery(null);
  }
  if (!Array.isArray(parsed)) return sanitizeQuery(null);
  const [measure, timeBucket, breakdown, chart, from, to, entityKeys] = parsed;
  return sanitizeQuery({ measure, timeBucket, breakdown, chart, from, to, entityKeys });
}

function timeFromParam(value: string | null): TimeBucket | string | null {
  if (value === null || value === "" || value === "none") return null;
  return value;
}

function clampDates(query: GraphQuery, range: DayRange): GraphQuery {
  return {
    ...query,
    from: canonicalBound(query.from, range, "from"),
    to: canonicalBound(query.to, range, "to"),
  };
}

function canonicalBound(value: string | null, range: DayRange, side: "from" | "to"): string | null {
  if (value === null) return null;
  let next = value;
  if (range.from !== null && next < range.from) next = range.from;
  if (range.to !== null && next > range.to) next = range.to;
  const edge = side === "from" ? range.from : range.to;
  if (next === edge) return null;
  return next;
}
