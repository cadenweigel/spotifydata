/**
 * The Graphs page query string.
 * This is the only place that reads or writes graph params. The chart and
 * the controls receive a query and a callback. A bare /graphs visit starts
 * from the saved query, then the URL becomes the source of truth.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  graphParamsMatch,
  parseGraphParams,
  serializeGraphParams,
} from "@/data/graph/graphParams";
import {
  GRAPH_PRESETS,
  matchingPresets,
  queriesEqual,
  readStoredGraphQuery,
  sanitizeQuery,
  type GraphQuery,
} from "@/data/graph/graphQuery";
import { useDataset } from "@/state/useDataset";
import { usePrefs } from "@/state/usePrefs";

export type GraphQueryModel = {
  query: GraphQuery;
  selectedPresetId: string | null;
  /** Increments when One artist is chosen, so the search box can take focus. */
  searchFocus: number;
  setQuery: (query: GraphQuery, presetId: string | null) => void;
};

/**
 * Reads the graph from the URL and writes the next one back.
 * Input is none. The dataset summary clamps dates the way the Data page
 * does. Returns the query, the preset button that matches it, and setQuery.
 * Entity keys stay in the URL and are left out of the saved preferences.
 */
export function useGraphQueryParams(): GraphQueryModel {
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataset } = useDataset();
  const [prefs, setPrefs] = usePrefs();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [searchFocus, setSearchFocus] = useState(0);
  const bare = searchParams.toString() === "";
  const meta = dataset?.meta;

  const query = useMemo(() => {
    if (bare) return sanitizeQuery(prefs.graphQuery);
    return parseGraphParams(searchParams, meta);
  }, [bare, prefs.graphQuery, searchParams, meta]);

  useEffect(() => {
    if (!meta) return;
    const canonical = serializeGraphParams(query);
    if (!graphParamsMatch(searchParams, canonical)) {
      setSearchParams(canonical, { replace: true });
    }
    const stored = readStoredGraphQuery(query);
    if (stored && !queriesEqual(stored, prefs.graphQuery)) {
      setPrefs({ graphQuery: stored });
    }
  }, [meta, query, searchParams, prefs.graphQuery, setSearchParams, setPrefs]);

  const setQuery = useCallback(
    (next: GraphQuery, presetId: string | null) => {
      const legal = sanitizeQuery(next);
      setPinnedId(presetId);
      if (presetId) {
        const preset = GRAPH_PRESETS.find((item) => item.id === presetId);
        if (preset?.focusEntitySearch) setSearchFocus((value) => value + 1);
      }
      setSearchParams(serializeGraphParams(legal), { replace: true });
      const stored = readStoredGraphQuery(legal);
      if (stored && !queriesEqual(stored, prefs.graphQuery)) setPrefs({ graphQuery: stored });
    },
    [prefs.graphQuery, setPrefs, setSearchParams],
  );

  const matches = matchingPresets(query);
  const selectedPresetId =
    pinnedId !== null && matches.some((preset) => preset.id === pinnedId)
      ? pinnedId
      : (matches[0]?.id ?? null);

  return { query, selectedPresetId, searchFocus, setQuery };
}
