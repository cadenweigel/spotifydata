/**
 * Counts the dataset summary after rows have been mapped to streams.
 * computeMeta does not read files and does not drop rows. ingest.ts passes
 * the sorted stream list, the files that kept a row, and how many video
 * files were classified.
 */

import type { DatasetMeta, Stream } from "@/data/types";

/** Counts that are not derived from the stream list. */
export type MetaCounts = {
  /** Files classified as video. They add no streams. */
  ignoredVideoFiles: number;
};

/**
 * Builds the summary stored on a dataset.
 * Input is the streams already sorted by endedAt, the base names of files
 * that contributed at least one stream, and the video-file count.
 * The date range is the first and last stream. An empty list has a null range.
 * Returns the counts, that range, a copy of the file names, and the video count.
 */
export function computeMeta(
  streams: readonly Stream[],
  sourceFiles: readonly string[],
  counts: MetaCounts,
): DatasetMeta {
  let musicCount = 0;
  let podcastCount = 0;
  for (const stream of streams) {
    if (stream.isPodcast) podcastCount += 1;
    else musicCount += 1;
  }

  return {
    streamCount: streams.length,
    musicCount,
    podcastCount,
    ignoredVideoFiles: counts.ignoredVideoFiles,
    minEndedAt: streams.length === 0 ? null : streams[0].endedAt,
    maxEndedAt:
      streams.length === 0 ? null : streams[streams.length - 1].endedAt,
    sourceFiles: [...sourceFiles],
  };
}
