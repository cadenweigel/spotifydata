/**
 * Search params for the Data page. No React.
 * parseDataParams reads a URL and fills in defaults. serializeDataParams
 * writes a URL and leaves default values out. Bad values become the
 * default for that param. Nothing here throws.
 */

import type { DatasetMeta, EntityKind, SortKey } from "@/data/types";
import {
  isOptionalColumnId,
  optionalColumnsForKind,
  type OptionalColumnId,
} from "./columns";

export const PAGE_SIZES = [25, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

/** One Data view, after invalid params have been replaced. */
export type DataViewState = {
  sort: SortKey;
  /** 1-based. A page past the end is clamped later, when the row count is known. */
  page: number;
  pageSize: PageSize;
  /**
   * Optional columns the user turned on.
   * null means every available optional column, and is left out of the URL.
   * An empty array means none. Locked ids are not required here, but one
   * may be present so a later sort can still honor an earlier choice.
   */
  cols: readonly OptionalColumnId[] | null;
  q: string;
  /** Inclusive local day, or null for the start of the dataset. */
  from: string | null;
  /** Inclusive local day, or null for the end of the dataset. */
  to: string | null;
};

/** Local calendar bounds of a dataset. Null when that side has no date. */
export type DayRange = {
  from: string | null;
  to: string | null;
};

const SORT_KEYS: readonly SortKey[] = [
  "streams",
  "listenTime",
  "firstStream",
  "lastStream",
  "alpha",
];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The dataset's first and last local days.
 * Input is the dataset summary. minEndedAt and maxEndedAt are UTC instants.
 * The days are the user's local calendar, which is what the date inputs use.
 * A missing or unreadable instant becomes null on that side.
 */
export function datasetDateRange(meta: Pick<DatasetMeta, "minEndedAt" | "maxEndedAt">): DayRange {
  const from = meta.minEndedAt === null ? null : toLocalDay(meta.minEndedAt);
  const to = meta.maxEndedAt === null ? null : toLocalDay(meta.maxEndedAt);
  if (from !== null && to !== null && from > to) return { from: to, to: from };
  return { from, to };
}

/**
 * Reads the Data page params.
 * Input is the query string, the dataset summary, and the table kind.
 * Unknown or invalid values become the default for that one param.
 * A day outside the dataset is clamped into it. A day that then equals
 * the dataset edge is stored as null, because that edge is the default.
 * Column ids the kind cannot show are dropped. This does not throw.
 */
export function parseDataParams(
  searchParams: URLSearchParams,
  meta: Pick<DatasetMeta, "minEndedAt" | "maxEndedAt">,
  kind: EntityKind,
): DataViewState {
  const range = datasetDateRange(meta);
  return {
    sort: parseSort(searchParams.get("sort")),
    page: parsePage(searchParams.get("page")),
    pageSize: parsePageSize(searchParams.get("pageSize")),
    cols: parseCols(searchParams.get("cols"), kind),
    q: parseQuery(searchParams.get("q")),
    from: parseBound(searchParams.get("from"), range, "from"),
    to: parseBound(searchParams.get("to"), range, "to"),
  };
}

/**
 * Writes the Data page params.
 * Input is the view, the dataset summary, and the table kind.
 * A value that equals the default is omitted. Days are clamped the same
 * way parseDataParams clamps them, so a round trip does not grow the URL.
 * An empty cols list is kept as an empty param, so Clear is not lost.
 */
export function serializeDataParams(
  state: DataViewState,
  meta: Pick<DatasetMeta, "minEndedAt" | "maxEndedAt">,
  kind: EntityKind,
): URLSearchParams {
  const params = new URLSearchParams();
  const range = datasetDateRange(meta);

  if (state.sort !== "streams") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(Math.trunc(state.page)));
  if (state.pageSize !== 100) params.set("pageSize", String(state.pageSize));
  if (state.cols !== null) {
    const ids = optionalColumnsForKind(kind).filter((id) => state.cols?.includes(id));
    params.set("cols", ids.join(","));
  }
  if (state.q.trim() !== "") params.set("q", state.q);
  const from = canonicalBound(state.from, range, "from");
  const to = canonicalBound(state.to, range, "to");
  if (from !== null) params.set("from", from);
  if (to !== null) params.set("to", to);
  return params;
}

/**
 * True when both queries carry the same values.
 * Input is two query strings. Key order does not matter.
 * A missing key and an empty value are not the same.
 */
export function searchParamsMatch(a: URLSearchParams, b: URLSearchParams): boolean {
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    if (a.get(key) !== b.get(key)) return false;
  }
  return true;
}

/**
 * The route segment for a table kind.
 * Input is artist, album, or track. Songs are the track table.
 */
export function paramFromKind(kind: EntityKind): string {
  if (kind === "artist") return "artists";
  if (kind === "album") return "albums";
  return "songs";
}

/**
 * The table kind for a route segment.
 * Input is the :kind param. artists, albums, and songs map to a kind.
 * Anything else returns null so the page can redirect.
 */
export function kindFromParam(param: string | undefined): EntityKind | null {
  if (param === "artists") return "artist";
  if (param === "albums") return "album";
  if (param === "songs") return "track";
  return null;
}

function parseSort(raw: string | null): SortKey {
  if (raw !== null && (SORT_KEYS as readonly string[]).includes(raw)) return raw as SortKey;
  return "streams";
}

function parsePage(raw: string | null): number {
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return 1;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return 1;
  return value;
}

function parsePageSize(raw: string | null): PageSize {
  if (raw === "25" || raw === "50" || raw === "100") return Number(raw) as PageSize;
  return 100;
}

function parseCols(raw: string | null, kind: EntityKind): OptionalColumnId[] | null {
  if (raw === null) return null;
  const wanted = new Set<OptionalColumnId>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (isOptionalColumnId(id)) wanted.add(id);
  }
  return optionalColumnsForKind(kind).filter((id) => wanted.has(id));
}

function parseQuery(raw: string | null): string {
  if (raw === null || raw.trim() === "") return "";
  return raw;
}

function parseBound(raw: string | null, range: DayRange, side: "from" | "to"): string | null {
  if (raw === null || !isIsoDay(raw)) return null;
  return canonicalBound(raw, range, side);
}

function canonicalBound(value: string | null, range: DayRange, side: "from" | "to"): string | null {
  const clamped = clampDay(value, range);
  if (clamped === null) return null;
  const edge = side === "from" ? range.from : range.to;
  if (clamped === edge) return null;
  return clamped;
}

function clampDay(value: string | null, range: DayRange): string | null {
  if (value === null || !isIsoDay(value)) return null;
  let next = value;
  if (range.from !== null && next < range.from) next = range.from;
  if (range.to !== null && next > range.to) next = range.to;
  return next;
}

function isIsoDay(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

/** Local YYYY-MM-DD for an ISO instant, or null when it cannot be read. */
function toLocalDay(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
