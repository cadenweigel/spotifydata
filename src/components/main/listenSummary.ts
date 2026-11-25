/**
 * Counts for the home page summary. Computed from the streams in memory,
 * never stored on the dataset, so a new threshold or podcast setting
 * changes the numbers on the next render.
 */

import type { Stream } from "@/data/types";
import { nameKey } from "@/data/names";

/** Totals for one pass over the stream list. */
export type ListenSummary = {
  /** Plays that passed the threshold and the podcast setting. */
  included: number;
  /** In-scope plays shorter than the threshold. */
  excludedByThreshold: number;
  /** Sum of msPlayed for included plays. */
  listenTimeMs: number;
  artistCount: number;
  trackCount: number;
  /** ISO-8601 UTC. Null when nothing was included. */
  firstEndedAt: string | null;
  /** ISO-8601 UTC. Null when nothing was included. */
  lastEndedAt: string | null;
  /** Podcast plays skipped because podcasts are off. */
  podcastsLeftOut: number;
};

/**
 * Summarizes a stream list for the current settings.
 * Input is the dataset's streams, the threshold in milliseconds, and
 * whether podcasts count. Streams are usually sorted by endedAt; the
 * first and last dates are compared anyway.
 * A play shorter than the threshold is excluded. A podcast is left out
 * when includePodcasts is false, and is not also counted as a short play.
 * Returns the included totals, the unique artist and track counts, and
 * how many plays the threshold removed.
 */
export function summarizeListening(
  streams: readonly Stream[],
  thresholdMs: number,
  includePodcasts: boolean,
): ListenSummary {
  const artists = new Set<string>();
  const tracks = new Set<string>();
  let included = 0;
  let excludedByThreshold = 0;
  let listenTimeMs = 0;
  let firstEndedAt: string | null = null;
  let lastEndedAt: string | null = null;
  let podcastsLeftOut = 0;

  for (const stream of streams) {
    if (stream.isPodcast && !includePodcasts) {
      podcastsLeftOut += 1;
      continue;
    }
    if (stream.msPlayed < thresholdMs) {
      excludedByThreshold += 1;
      continue;
    }
    included += 1;
    listenTimeMs += stream.msPlayed;
    artists.add(nameKey(stream.artist));
    tracks.add(trackKey(stream));
    if (firstEndedAt === null || stream.endedAt < firstEndedAt) {
      firstEndedAt = stream.endedAt;
    }
    if (lastEndedAt === null || stream.endedAt > lastEndedAt) {
      lastEndedAt = stream.endedAt;
    }
  }

  return {
    included,
    excludedByThreshold,
    listenTimeMs,
    artistCount: artists.size,
    trackCount: tracks.size,
    firstEndedAt,
    lastEndedAt,
    podcastsLeftOut,
  };
}

/**
 * Grouping key for one track.
 * Input is a stream. A Spotify URI wins, so two names for one track stay
 * together. Without a URI, the artist, album, and track name are the key,
 * so two editions of a local file stay apart.
 */
function trackKey(stream: Stream): string {
  if (stream.trackUri) return `uri:${stream.trackUri}`;
  return `name:${nameKey(stream.artist)}\u0000${nameKey(stream.album ?? "")}\u0000${nameKey(stream.track)}`;
}
