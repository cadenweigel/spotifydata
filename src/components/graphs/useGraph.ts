/**
 * The memoized chart points for one query.
 * GraphChart uses this. Another view can use it without drawing a chart.
 * A new query keeps the previous points until the next ones are ready.
 */

import { useDeferredValue, useMemo } from "react";
import type { Stream } from "@/data/types";
import { buildGraph, type GraphResult } from "@/data/graph/graph";
import { graphQueryKey, queryFromKey } from "@/data/graph/graphParams";
import type { GraphQuery } from "@/data/graph/graphQuery";
import { useDataset } from "@/state/useDataset";
import { usePrefs } from "@/state/usePrefs";

const EMPTY_STREAMS: Stream[] = [];

export type GraphStatus = "empty" | "ready" | "loading";

export type GraphModel = GraphResult & {
  query: GraphQuery;
  status: GraphStatus;
};

/**
 * Builds the points for a query.
 * Input is the query and, optionally, a stream list that replaces the
 * loaded dataset. The threshold and podcast setting come from preferences.
 * Returns the points, their labels, and a status. "loading" means the
 * previous points are still the ones returned while a new query is drawn.
 */
export function useGraph(query: GraphQuery, streamsOverride?: readonly Stream[]): GraphModel {
  const { dataset } = useDataset();
  const [prefs] = usePrefs();
  const source = streamsOverride ?? dataset?.streams ?? EMPTY_STREAMS;
  const queryKey = graphQueryKey(query);
  const deferredKey = useDeferredValue(queryKey);
  const deferredStreams = useDeferredValue(source);

  const renderedQuery = useMemo(() => queryFromKey(deferredKey), [deferredKey]);

  const result = useMemo(
    () =>
      buildGraph(deferredStreams, renderedQuery, {
        thresholdMs: prefs.streamThresholdMs,
        includePodcasts: prefs.includePodcasts,
      }),
    [deferredStreams, renderedQuery, prefs.streamThresholdMs, prefs.includePodcasts],
  );

  const stale = deferredKey !== queryKey || deferredStreams !== source;
  const status: GraphStatus = stale ? "loading" : result.points.length === 0 ? "empty" : "ready";
  return { ...result, query: renderedQuery, status };
}
