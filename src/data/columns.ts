/**
 * Which columns the Data table shows. No React.
 * Rank and name are always locked. The column for the current sort is
 * locked too and sits right after name. Optional columns stay in one
 * fixed order. A column that is null on every row is left out.
 */

import type { EntityKind, EntityRow, SortKey } from "@/data/types";

/** Table order, including the two columns that are always shown. */
export const COLUMN_IDS = [
  "rank",
  "name",
  "streams",
  "listenTime",
  "firstStream",
  "lastStream",
  "trackCount",
  "albumCount",
  "skipRate",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

/** Columns the user can turn on and off. Rank and name are not in this list. */
export const OPTIONAL_COLUMN_IDS = [
  "streams",
  "listenTime",
  "firstStream",
  "lastStream",
  "trackCount",
  "albumCount",
  "skipRate",
] as const;

export type OptionalColumnId = (typeof OPTIONAL_COLUMN_IDS)[number];

/** The metric column a sort forces on. Alphabetical sort forces none. */
const SORT_COLUMN: Record<SortKey, OptionalColumnId | null> = {
  streams: "streams",
  listenTime: "listenTime",
  firstStream: "firstStream",
  lastStream: "lastStream",
  alpha: null,
};

const LABELS: Record<Exclude<ColumnId, "name">, string> = {
  rank: "#",
  streams: "Streams",
  listenTime: "Listen time",
  firstStream: "First stream",
  lastStream: "Last stream",
  trackCount: "Tracks",
  albumCount: "Albums",
  skipRate: "Skip rate",
};

/**
 * Header text for one column.
 * Input is the column and the table kind. The name column uses Artist,
 * Album, or Song. The other headers do not change with the kind.
 */
export function columnLabel(id: ColumnId, kind: EntityKind): string {
  if (id === "name") {
    if (kind === "artist") return "Artist";
    if (kind === "album") return "Album";
    return "Song";
  }
  return LABELS[id];
}

/**
 * True for counts, durations, and percents.
 * Input is a column id. Dates and the name are not numeric.
 * Those cells are right-aligned and use tabular numerals.
 */
export function isNumericColumn(id: ColumnId): boolean {
  return (
    id === "rank" ||
    id === "streams" ||
    id === "listenTime" ||
    id === "trackCount" ||
    id === "albumCount" ||
    id === "skipRate"
  );
}

/** True when the string is an optional column id. */
export function isOptionalColumnId(value: string): value is OptionalColumnId {
  return (OPTIONAL_COLUMN_IDS as readonly string[]).includes(value);
}

/**
 * Optional columns that exist for this kind.
 * Album counts are artists only. Track counts are artists and albums.
 * The other optional columns exist for every kind.
 */
export function optionalColumnsForKind(kind: EntityKind): OptionalColumnId[] {
  return OPTIONAL_COLUMN_IDS.filter((id) => appliesToKind(id, kind));
}

/** The sort's metric column, or null for alphabetical. */
export function sortColumnId(sortKey: SortKey): OptionalColumnId | null {
  return SORT_COLUMN[sortKey];
}

/**
 * Columns the user cannot hide for this sort.
 * Input is the sort key. Alphabetical sort locks rank and name only.
 * Every other sort also locks its metric column, after name.
 */
export function lockedColumnIds(sortKey: SortKey): ColumnId[] {
  const extra = SORT_COLUMN[sortKey];
  if (extra === null) return ["rank", "name"];
  return ["rank", "name", extra];
}

/**
 * Optional columns that have something to show.
 * Input is the kind and every row in the filtered result, not one page.
 * A column the kind does not use is dropped. So is a column that is null
 * on every row. Streams, listen time, and the two dates are never null,
 * so they stay as soon as there is one row.
 */
export function availableOptionalColumns(
  kind: EntityKind,
  rows: readonly EntityRow[],
): OptionalColumnId[] {
  if (rows.length === 0) return [];

  const candidates = optionalColumnsForKind(kind);
  let track = false;
  let album = false;
  let skip = false;
  const wantsTrack = candidates.includes("trackCount");
  const wantsAlbum = candidates.includes("albumCount");
  const wantsSkip = candidates.includes("skipRate");

  if (wantsTrack || wantsAlbum || wantsSkip) {
    for (const row of rows) {
      if (wantsTrack && row.trackCount !== null) track = true;
      if (wantsAlbum && row.albumCount !== null) album = true;
      if (wantsSkip && row.skipRate !== null) skip = true;
      if ((!wantsTrack || track) && (!wantsAlbum || album) && (!wantsSkip || skip)) break;
    }
  }

  return candidates.filter((id) => {
    if (id === "trackCount") return track;
    if (id === "albumCount") return album;
    if (id === "skipRate") return skip;
    return true;
  });
}

/**
 * Columns to draw, in table order.
 * Input is the sort, the stored cols (null means all available), and the
 * available optional columns. Locked columns come first. A locked id that
 * also appears in cols is not drawn twice. Then the selected optional
 * columns follow, skipping any that are locked or not available.
 */
export function visibleColumns(
  sortKey: SortKey,
  cols: readonly string[] | null,
  available: readonly OptionalColumnId[],
): ColumnId[] {
  const locked = lockedColumnIds(sortKey);
  const lockedSet = new Set<string>(locked);
  const availableSet = new Set<string>(available);
  const selected = cols === null ? availableSet : new Set(cols);
  const optional = OPTIONAL_COLUMN_IDS.filter(
    (id) => availableSet.has(id) && selected.has(id) && !lockedSet.has(id),
  );
  return [...locked, ...optional];
}

export type ColumnAction =
  | { type: "toggle"; id: OptionalColumnId }
  | { type: "all" }
  | { type: "clear" };

/**
 * The cols value to store after a picker action.
 * Input is the previous cols, the columns that can show, the locked
 * columns, and the action. null means every available column is on.
 * An empty array means Clear. Select all returns null.
 * A locked id the user had turned on stays in an explicit list, so a
 * later sort still shows it. visibleColumns does not draw that id twice
 * while it remains the sort column. Toggling a locked id changes nothing.
 */
export function columnSelection(
  previous: readonly OptionalColumnId[] | null,
  available: readonly OptionalColumnId[],
  locked: readonly ColumnId[],
  action: ColumnAction,
): readonly OptionalColumnId[] | null {
  if (action.type === "all") return null;
  if (action.type === "clear") return [];

  const lockedSet = new Set<string>(locked);
  if (lockedSet.has(action.id)) return previous;

  const selected = new Set<OptionalColumnId>(previous === null ? available : previous);
  if (selected.has(action.id)) selected.delete(action.id);
  else selected.add(action.id);

  const unlockedOn = available.every((id) => lockedSet.has(id) || selected.has(id));
  const lockedOn = locked.every(
    (id) => id === "rank" || id === "name" || selected.has(id as OptionalColumnId),
  );
  if (unlockedOn && lockedOn) return null;

  return OPTIONAL_COLUMN_IDS.filter((id) => selected.has(id));
}

/**
 * Drops a cols list that is the same as showing everything.
 * Input is the stored cols and the columns that can show. null stays null.
 * An empty list stays empty, so Clear is not treated as Select all.
 * A list that names exactly the available columns becomes null.
 */
export function normalizeColumnSelection(
  cols: readonly OptionalColumnId[] | null,
  available: readonly OptionalColumnId[],
): readonly OptionalColumnId[] | null {
  if (cols === null) return null;
  if (available.length === 0) return cols;
  const availableSet = new Set<string>(available);
  const coversAvailable = available.every((id) => cols.includes(id));
  const onlyAvailable = cols.every((id) => availableSet.has(id));
  if (coversAvailable && onlyAvailable) return null;
  return cols;
}

function appliesToKind(id: OptionalColumnId, kind: EntityKind): boolean {
  if (id === "albumCount") return kind === "artist";
  if (id === "trackCount") return kind === "artist" || kind === "album";
  return true;
}
