/**
 * Axis and tooltip text for every chart. Listen time stays in milliseconds
 * until this layer. The plotted number is hours, with one decimal on the
 * axis. The tooltip spells the same value as hours and minutes.
 */

import type { GraphResult } from "@/data/graph/graph";
import type { GraphQuery, Measure } from "@/data/graph/graphQuery";
import { MEASURE_LABELS } from "@/data/graph/graphQuery";
import { formatDuration, formatInt } from "@/data/format";

/** Skip chart animation past this many buckets. Long daily ranges stutter. */
export const ANIMATION_POINT_LIMIT = 2_000;

/** Hide line dots past this many buckets so the stroke stays readable. */
export const DOT_POINT_LIMIT = 200;

const HOUR_MS = 3_600_000;

/**
 * The number the axis plots.
 * Input is the measure and the raw total from buildGraph. Listen time
 * becomes hours. Counts stay whole numbers.
 */
export function plotValue(measure: Measure, raw: number): number {
  if (measure !== "listenTime") return raw;
  return Math.round((raw / HOUR_MS) * 10) / 10;
}

/**
 * Axis text for one plotted number.
 * Input is the measure and the value already passed through plotValue.
 * Listen time keeps a single decimal. Counts are grouped integers.
 */
export function formatAxisValue(measure: Measure, value: number): string {
  if (measure === "listenTime") return value.toFixed(1);
  return formatInt(value);
}

/**
 * Tooltip text for one raw total.
 * Input is the measure and the millisecond or count from buildGraph.
 * Listen time is hours and minutes. Counts are integers.
 */
export function formatTooltipValue(measure: Measure, raw: number): string {
  if (measure === "listenTime") return formatDuration(raw);
  return formatInt(raw);
}

/** True when the axis should not show decimal ticks. */
export function isCountMeasure(measure: Measure): boolean {
  return measure !== "listenTime";
}

/**
 * The sentence under the chart.
 * Input is the query and the points. Streams and listen time include the
 * total of the plotted points. Unique counts do not, because adding months
 * would count the same artist more than once. The date text is the first
 * and last bucket label.
 */
export function chartSummary(query: GraphQuery, result: GraphResult): string {
  const labels = result.points.map((point) => result.categoryLabels[point.x] ?? point.x);
  const range =
    labels.length === 0
      ? ""
      : labels.length === 1
        ? labels[0]
        : `${labels[0]} – ${labels[labels.length - 1]}`;
  const title = MEASURE_LABELS[query.measure];
  if (query.measure !== "streams" && query.measure !== "listenTime") {
    return range === "" ? title : `${title} · ${range}`;
  }
  let total = 0;
  for (const point of result.points) {
    for (const key of result.seriesKeys) total += point.series[key] ?? 0;
  }
  const amount = query.measure === "listenTime" ? formatDuration(total) : formatInt(total);
  return range === "" ? `${title} · ${amount}` : `${title} · ${amount} · ${range}`;
}
