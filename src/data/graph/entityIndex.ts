/**
 * Names the entity search can offer. Built once per dataset and kind.
 * The list is sorted by stream count, so the first matches are the ones
 * the chart is most likely to plot.
 */

import type { EntityKind, Stream } from "@/data/types";
import { filterStreams, groupEntities } from "@/data/aggregate";

export type EntityHit = {
  key: string;
  name: string;
  streams: number;
};

/**
 * One search list for a kind.
 * Input is the stream list, the kind, and the listen settings. Podcasts
 * and short plays follow those settings. The date range is left open, so
 * a name can be chosen before the chart's dates are narrowed. The result
 * is highest stream count first.
 */
export function entityIndex(
  streams: readonly Stream[],
  kind: EntityKind,
  scope: { thresholdMs: number; includePodcasts: boolean },
): EntityHit[] {
  const filtered = filterStreams(streams, {
    thresholdMs: scope.thresholdMs,
    includePodcasts: scope.includePodcasts,
    from: null,
    to: null,
  });
  const hits = groupEntities(filtered, kind).map((row) => ({
    key: row.key,
    name: row.name,
    streams: row.streams,
  }));
  hits.sort((a, b) => {
    if (a.streams !== b.streams) return b.streams - a.streams;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });
  return hits;
}

/**
 * At most ten suggestions for the text the user has typed.
 * Input is the index, the typed text, and the keys already chosen.
 * Matching is a case-insensitive substring of the display name. A blank
 * query returns nothing, so the list stays closed until there is text.
 * Chosen keys are skipped. The index order is kept.
 */
export function matchEntityHits(
  hits: readonly EntityHit[],
  text: string,
  selected: ReadonlySet<string>,
): EntityHit[] {
  const needle = text.trim().toLowerCase();
  if (needle === "") return [];
  const matched: EntityHit[] = [];
  for (const hit of hits) {
    if (selected.has(hit.key)) continue;
    if (!hit.name.toLowerCase().includes(needle)) continue;
    matched.push(hit);
    if (matched.length === 10) break;
  }
  return matched;
}
