/**
 * Colors for chart series. A series keeps the color of its rank, not its
 * name, so the top artist staying first keeps the same color when only the
 * eighth name changes. Do not key this palette by name.
 *
 * The eight colors stay apart under common color-blindness (they differ in
 * lightness, not only red versus green). Each one clears 3:1 against the
 * light page (#f6f7f4, #ffffff) and the dark page (#0c100c, #151b15).
 * Other is a neutral gray and never takes a slot.
 */

import { OTHER_KEY } from "@/data/graph/graph";

export const SERIES_COLORS = [
  "#0072B2",
  "#E65100",
  "#2F7D4F",
  "#C43E6A",
  "#5C6BC0",
  "#8F6E00",
  "#00838F",
  "#546E7A",
] as const;

/** Neutral gray for the Other bar. Visible on light and dark backgrounds. */
export const OTHER_COLOR = "#7A817A";

/**
 * The color for one series.
 * Input is the series rank, starting at 0, and its stable key. Other is
 * always the gray. Every other key uses the palette slot for that rank.
 */
export function seriesColor(rank: number, key: string): string {
  if (key === OTHER_KEY) return OTHER_COLOR;
  const index = rank < 0 ? 0 : rank % SERIES_COLORS.length;
  return SERIES_COLORS[index] ?? SERIES_COLORS[0];
}
