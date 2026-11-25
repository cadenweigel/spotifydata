/**
 * The Data page view. This is the only place that reads the query string.
 * It filters, groups, searches, sorts, and pages, then hands the pieces
 * to the table. Components do not touch the URL.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  filterStreams,
  groupEntities,
  paginate,
  searchEntities,
  sortEntities,
} from "@/data/aggregate";
import {
  availableOptionalColumns,
  columnLabel,
  columnSelection,
  isOptionalColumnId,
  lockedColumnIds,
  normalizeColumnSelection,
  sortColumnId,
  visibleColumns,
  type ColumnAction,
  type ColumnId,
  type OptionalColumnId,
} from "@/data/columns";
import {
  datasetDateRange,
  parseDataParams,
  searchParamsMatch,
  serializeDataParams,
  type DataViewState,
  type PageSize,
} from "@/data/dataParams";
import type { DatasetMeta, EntityKind, EntityRow, SortKey, Stream } from "@/data/types";
import type { PickerColumn } from "@/components/data/ColumnPicker";
import { useDataset } from "@/state/useDataset";
import { usePrefs } from "@/state/usePrefs";

const EMPTY_STREAMS: Stream[] = [];

const EMPTY_META: DatasetMeta = {
  streamCount: 0,
  musicCount: 0,
  podcastCount: 0,
  ignoredVideoFiles: 0,
  minEndedAt: null,
  maxEndedAt: null,
  sourceFiles: [],
};

export type DataEmpty = "none" | "filter" | "no-albums";

export type DataViewModel = {
  ready: boolean;
  title: string;
  noun: string;
  kind: EntityKind;
  sort: SortKey;
  page: number;
  pageSize: PageSize;
  pageCount: number;
  total: number;
  startRank: number;
  endRank: number;
  rows: EntityRow[];
  columns: ColumnId[];
  pickerColumns: PickerColumn[];
  caption: string;
  query: string;
  from: string;
  to: string;
  rangeFrom: string;
  rangeTo: string;
  datesDiffer: boolean;
  empty: DataEmpty;
  tabSearch: string;
  setSort: (sort: SortKey) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: PageSize) => void;
  setQuery: (query: string) => void;
  setDates: (from: string, to: string) => void;
  resetDates: () => void;
  resetFilter: () => void;
  toggleColumn: (id: ColumnId) => void;
  selectAllColumns: () => void;
  clearColumns: () => void;
};

/**
 * Builds the view for one kind.
 * Input is artist, album, or track. The query string supplies sort, page,
 * columns, search, and dates. The listen-time and podcast settings come
 * from preferences. Returns the rows for this page and the callbacks that
 * write the query string. Typing and date edits replace the current history
 * entry. Sort, page, page size, and columns push a new one.
 */
export function useDataView(kind: EntityKind): DataViewModel {
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataset } = useDataset();
  const [prefs] = usePrefs();
  const search = searchParams.toString();
  const meta = dataset?.meta;

  const state = useMemo(
    () => parseDataParams(new URLSearchParams(search), meta ?? EMPTY_META, kind),
    [search, meta, kind],
  );

  const streams = dataset?.streams ?? EMPTY_STREAMS;
  const filtered = useMemo(
    () =>
      filterStreams(streams, {
        thresholdMs: prefs.streamThresholdMs,
        includePodcasts: prefs.includePodcasts,
        from: state.from,
        to: state.to,
      }),
    [streams, prefs.streamThresholdMs, prefs.includePodcasts, state.from, state.to],
  );
  const grouped = useMemo(() => groupEntities(filtered, kind), [filtered, kind]);
  const searched = useMemo(() => searchEntities(grouped, state.q), [grouped, state.q]);
  const sorted = useMemo(() => sortEntities(searched, state.sort), [searched, state.sort]);
  const paged = useMemo(
    () => paginate(sorted, state.page, state.pageSize),
    [sorted, state.page, state.pageSize],
  );
  const available = useMemo(
    () => availableOptionalColumns(kind, sorted),
    [kind, sorted],
  );
  const columns = useMemo(
    () => visibleColumns(state.sort, state.cols, available),
    [state.sort, state.cols, available],
  );

  const hasAlbums = useMemo(
    () => (dataset === null ? false : streamsHaveAlbums(dataset.streams)),
    [dataset],
  );

  const readyRef = useRef(false);
  const stateRef = useRef(state);
  const metaRef = useRef(meta ?? EMPTY_META);
  const availableRef = useRef(available);
  readyRef.current = dataset !== null;
  stateRef.current = state;
  metaRef.current = meta ?? EMPTY_META;
  availableRef.current = available;

  const write = useCallback(
    (next: DataViewState, replace: boolean) => {
      if (!readyRef.current) return;
      setSearchParams(serializeDataParams(next, metaRef.current, kind), { replace });
    },
    [kind, setSearchParams],
  );

  useEffect(() => {
    if (dataset === null) return;
    const cols = normalizeColumnSelection(state.cols, available);
    const next = serializeDataParams(
      { ...state, page: paged.page, cols },
      dataset.meta,
      kind,
    );
    if (searchParamsMatch(new URLSearchParams(search), next)) return;
    setSearchParams(next, { replace: true });
  }, [dataset, state, available, paged.page, kind, search, setSearchParams]);

  const setSort = useCallback(
    (sort: SortKey) => {
      const current = stateRef.current;
      if (!readyRef.current || sort === current.sort) return;
      write({ ...current, sort, page: 1 }, false);
    },
    [write],
  );

  const setPage = useCallback(
    (page: number) => {
      const current = stateRef.current;
      if (!readyRef.current || page === current.page) return;
      write({ ...current, page }, false);
    },
    [write],
  );

  const setPageSize = useCallback(
    (pageSize: PageSize) => {
      const current = stateRef.current;
      if (!readyRef.current || (pageSize === current.pageSize && current.page === 1)) return;
      write({ ...current, pageSize, page: 1 }, false);
    },
    [write],
  );

  const setQuery = useCallback(
    (q: string) => {
      const current = stateRef.current;
      if (!readyRef.current || (q === current.q && current.page === 1)) return;
      write({ ...current, q, page: 1 }, true);
    },
    [write],
  );

  const setDates = useCallback(
    (from: string, to: string) => {
      if (!readyRef.current) return;
      const range = datasetDateRange(metaRef.current);
      const nextFrom = from === range.from ? null : from;
      const nextTo = to === range.to ? null : to;
      const current = stateRef.current;
      if (current.from === nextFrom && current.to === nextTo && current.page === 1) return;
      write({ ...current, from: nextFrom, to: nextTo, page: 1 }, true);
    },
    [write],
  );

  const resetDates = useCallback(() => {
    const current = stateRef.current;
    if (!readyRef.current || (current.from === null && current.to === null && current.page === 1)) {
      return;
    }
    write({ ...current, from: null, to: null, page: 1 }, true);
  }, [write]);

  const resetFilter = useCallback(() => {
    const current = stateRef.current;
    if (
      !readyRef.current ||
      (current.q === "" && current.from === null && current.to === null && current.page === 1)
    ) {
      return;
    }
    write({ ...current, q: "", from: null, to: null, page: 1 }, true);
  }, [write]);

  const applyColumns = useCallback(
    (action: ColumnAction) => {
      if (!readyRef.current) return;
      const current = stateRef.current;
      const next = columnSelection(
        current.cols,
        availableRef.current,
        lockedColumnIds(current.sort),
        action,
      );
      if (sameCols(current.cols, next)) return;
      write({ ...current, cols: next }, false);
    },
    [write],
  );

  const toggleColumn = useCallback(
    (id: ColumnId) => {
      if (!isOptionalColumnId(id)) return;
      applyColumns({ type: "toggle", id });
    },
    [applyColumns],
  );

  const selectAllColumns = useCallback(() => applyColumns({ type: "all" }), [applyColumns]);
  const clearColumns = useCallback(() => applyColumns({ type: "clear" }), [applyColumns]);

  const range = meta === undefined ? { from: null, to: null } : datasetDateRange(meta);
  const title = kindTitle(kind);
  const noun = kindNoun(kind);
  const noAlbums = kind === "album" && dataset !== null && !hasAlbums;
  const empty: DataEmpty = noAlbums ? "no-albums" : paged.total === 0 && dataset !== null ? "filter" : "none";
  const tabSearch = useMemo(() => {
    if (meta === undefined) return "";
    const text = serializeDataParams({ ...state, page: 1, cols: null }, meta, kind).toString();
    return text === "" ? "" : `?${text}`;
  }, [meta, state, kind]);

  return {
    ready: dataset !== null,
    title,
    noun,
    kind,
    sort: state.sort,
    page: paged.page,
    pageSize: state.pageSize,
    pageCount: paged.pageCount,
    total: paged.total,
    startRank: paged.startRank,
    endRank: paged.total === 0 ? 0 : paged.startRank + paged.rows.length - 1,
    rows: paged.rows,
    columns,
    pickerColumns: pickerColumns(kind, state.sort, state.cols, available),
    caption: tableCaption(noun, state.sort),
    query: state.q,
    from: state.from ?? range.from ?? "",
    to: state.to ?? range.to ?? "",
    rangeFrom: range.from ?? "",
    rangeTo: range.to ?? "",
    datesDiffer: state.from !== null || state.to !== null,
    empty,
    tabSearch,
    setSort,
    setPage,
    setPageSize,
    setQuery,
    setDates,
    resetDates,
    resetFilter,
    toggleColumn,
    selectAllColumns,
    clearColumns,
  };
}

function pickerColumns(
  kind: EntityKind,
  sort: SortKey,
  cols: readonly OptionalColumnId[] | null,
  available: readonly OptionalColumnId[],
): PickerColumn[] {
  const locked = lockedColumnIds(sort);
  const lockedSet = new Set<string>(locked);
  const metric = sortColumnId(sort);
  const selected = cols === null ? null : new Set<string>(cols);
  const lockedColumns: PickerColumn[] = locked.map((id) => ({
    id,
    label: columnLabel(id, kind),
    locked: true,
    checked: true,
    note: id === metric ? "Shown because it is the current sort" : null,
  }));
  const optional = available
    .filter((id) => !lockedSet.has(id))
    .map((id) => ({
      id,
      label: columnLabel(id, kind),
      locked: false,
      checked: selected === null || selected.has(id),
      note: null,
    }));
  return [...lockedColumns, ...optional];
}

function kindTitle(kind: EntityKind): string {
  if (kind === "artist") return "Artists";
  if (kind === "album") return "Albums";
  return "Songs";
}

function kindNoun(kind: EntityKind): string {
  if (kind === "artist") return "artists";
  if (kind === "album") return "albums";
  return "songs";
}

function tableCaption(noun: string, sort: SortKey): string {
  const titled = noun.charAt(0).toUpperCase() + noun.slice(1);
  switch (sort) {
    case "streams":
      return `Top ${noun} by streams`;
    case "listenTime":
      return `Top ${noun} by listen time`;
    case "firstStream":
      return `${titled} by first stream`;
    case "lastStream":
      return `${titled} by most recently streamed`;
    case "alpha":
      return `${titled} in alphabetical order`;
  }
}

function streamsHaveAlbums(streams: readonly Stream[]): boolean {
  for (const stream of streams) {
    if (stream.album !== null) return true;
  }
  return false;
}

function sameCols(
  a: readonly OptionalColumnId[] | null,
  b: readonly OptionalColumnId[] | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}
