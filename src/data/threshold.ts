/**
 * Duration filter used before rankings and graphs.
 * streamsMeetingThreshold keeps plays that lasted at least the given time.
 * Ingest still stores the shorter rows. This does not drop podcasts or apply dates.
 */

import type { Stream } from "@/data/types";

/**
 * Keeps streams whose play time is at least thresholdMs.
 * Input is a stream list and the threshold in milliseconds.
 * 30_000 keeps a play of exactly 30 seconds and drops a shorter one.
 * 0 keeps every stream, including zero-length plays.
 * Returns a new array in the same order. The input is left unchanged.
 */
export function streamsMeetingThreshold(
  streams: readonly Stream[],
  thresholdMs: number,
): Stream[] {
  const kept: Stream[] = [];
  for (const stream of streams) {
    if (stream.msPlayed >= thresholdMs) kept.push(stream);
  }
  return kept;
}
