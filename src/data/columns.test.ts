/**
 * Tests for column locking, which optional columns a result can show,
 * and how a picker action rewrites cols.
 */

import { describe, expect, it } from "vitest";
import type { EntityRow, SortKey } from "@/data/types";
import {
  availableOptionalColumns,
  columnSelection,
  lockedColumnIds,
  normalizeColumnSelection,
  visibleColumns,
  type OptionalColumnId,
} from "./columns";

const sorts: SortKey[] = ["streams", "listenTime", "firstStream", "lastStream", "alpha"];

function row(overrides: Partial<EntityRow> = {}): EntityRow {
  return {
    key: "k",
    name: "Name",
    subtitle: null,
    streams: 1,
    listenTimeMs: 60_000,
    firstStream: "2020-01-01T00:00:00.000Z",
    lastStream: "2020-01-01T00:00:00.000Z",
    trackCount: 1,
    albumCount: 1,
    skipRate: null,
    ...overrides,
  };
}

describe("lockedColumnIds", () => {
  // Each sort locks rank, name, and its own metric. Alpha locks no metric.
  // Input: all five sort keys.
  // Expected: the locked ids listed in the plan.
  it("locks rank, name, and the sort column", () => {
    expect(lockedColumnIds("streams")).toEqual(["rank", "name", "streams"]);
    expect(lockedColumnIds("listenTime")).toEqual(["rank", "name", "listenTime"]);
    expect(lockedColumnIds("firstStream")).toEqual(["rank", "name", "firstStream"]);
    expect(lockedColumnIds("lastStream")).toEqual(["rank", "name", "lastStream"]);
    expect(lockedColumnIds("alpha")).toEqual(["rank", "name"]);
    expect(sorts).toHaveLength(5);
  });
});

describe("availableOptionalColumns", () => {
  // Album counts are artists only. Track counts are artists and albums.
  // Input: one full row for each kind.
  // Expected: songs omit both count columns, albums omit album counts.
  it("drops columns the kind does not have", () => {
    const rows = [row()];
    expect(availableOptionalColumns("artist", rows)).toEqual([
      "streams",
      "listenTime",
      "firstStream",
      "lastStream",
      "trackCount",
      "albumCount",
    ]);
    expect(availableOptionalColumns("album", rows)).not.toContain("albumCount");
    expect(availableOptionalColumns("album", rows)).toContain("trackCount");
    expect(availableOptionalColumns("track", rows)).not.toContain("trackCount");
    expect(availableOptionalColumns("track", rows)).not.toContain("albumCount");
  });

  // Skip rate stays hidden until one row has a known skip.
  // Input: two artist rows, then one of them with a skip rate.
  // Expected: the column is absent, then present.
  it("hides a column that is null on every row", () => {
    const rows = [row({ skipRate: null }), row({ key: "b", skipRate: null })];
    expect(availableOptionalColumns("artist", rows)).not.toContain("skipRate");
    const withSkip = [row({ skipRate: 0.5 })];
    expect(availableOptionalColumns("artist", withSkip)).toContain("skipRate");
  });

  // No rows means no optional column, including the ones that are never null.
  // Input: an empty list.
  // Expected: no optional columns.
  it("returns nothing when there are no rows", () => {
    expect(availableOptionalColumns("artist", [])).toEqual([]);
  });
});

describe("visibleColumns", () => {
  const available: OptionalColumnId[] = [
    "streams",
    "listenTime",
    "firstStream",
    "lastStream",
    "trackCount",
    "albumCount",
  ];

  // The default cols value shows the sort metric and the other metrics.
  // Input: sort streams, cols null, a full artist column set.
  // Expected: rank, name, streams, then listen time and the rest.
  it("shows streams and listen time when cols is omitted", () => {
    expect(visibleColumns("streams", null, available)).toEqual([
      "rank",
      "name",
      "streams",
      "listenTime",
      "firstStream",
      "lastStream",
      "trackCount",
      "albumCount",
    ]);
  });

  // Switching the sort locks the new metric and puts the old one back.
  // Input: cols that include streams and exclude listen time.
  // Expected: listen time is forced on, and streams stays because cols has it.
  it("locks the new sort column and keeps the earlier cols", () => {
    const cols = ["streams", "firstStream"];
    expect(visibleColumns("streams", cols, available)).toEqual([
      "rank",
      "name",
      "streams",
      "firstStream",
    ]);
    expect(visibleColumns("listenTime", cols, available)).toEqual([
      "rank",
      "name",
      "listenTime",
      "streams",
      "firstStream",
    ]);
  });

  // A locked id inside cols does not add a second copy of that column.
  // Input: sort streams, cols that repeats streams plus listen time.
  // Expected: streams once, then listen time.
  it("ignores a locked id stored in cols", () => {
    expect(visibleColumns("streams", ["streams", "listenTime"], available)).toEqual([
      "rank",
      "name",
      "streams",
      "listenTime",
    ]);
  });

  // Optional columns follow the table order, not the order written in the URL.
  // Input: cols listing skip rate before listen time.
  // Expected: listen time, then skip rate.
  it("keeps optional columns in table order", () => {
    const withSkip: OptionalColumnId[] = [...available, "skipRate"];
    expect(visibleColumns("streams", ["skipRate", "listenTime"], withSkip)).toEqual([
      "rank",
      "name",
      "streams",
      "listenTime",
      "skipRate",
    ]);
  });
});

describe("columnSelection", () => {
  const available: OptionalColumnId[] = [
    "streams",
    "listenTime",
    "firstStream",
    "lastStream",
  ];
  const locked = lockedColumnIds("streams");

  // Turning one column off remembers that the sort column was on.
  // Input: the default (null) selection, toggle listen time off.
  // Expected: streams stays selected, listen time does not.
  it("keeps a locked column that was on when another column is turned off", () => {
    const next = columnSelection(null, available, locked, {
      type: "toggle",
      id: "listenTime",
    });
    expect(next).toContain("streams");
    expect(next).not.toContain("listenTime");
    expect(visibleColumns("listenTime", next, available)).toEqual([
      "rank",
      "name",
      "listenTime",
      "streams",
      "firstStream",
      "lastStream",
    ]);
  });

  // A column the user hid before it became the sort stays hidden afterward.
  // Input: cols without streams, while streams is the locked sort.
  // Expected: toggling something else does not add streams back.
  it("does not turn a hidden sort column back on", () => {
    const next = columnSelection(["firstStream"], available, locked, {
      type: "toggle",
      id: "listenTime",
    });
    expect(next).toEqual(["listenTime", "firstStream"]);
    expect(visibleColumns("alpha", next, available)).not.toContain("streams");
  });

  // Clear stores no optional columns. Select all stores the default.
  // Input: a partial list, then both actions.
  // Expected: an empty list, then null.
  it("clears and selects all", () => {
    expect(columnSelection(["listenTime"], available, locked, { type: "clear" })).toEqual([]);
    expect(columnSelection(["listenTime"], available, locked, { type: "all" })).toBeNull();
    expect(visibleColumns("streams", [], available)).toEqual(["rank", "name", "streams"]);
  });

  // The locked checkbox cannot change the stored list.
  // Input: a toggle of the streams id while streams is locked.
  // Expected: the previous list, unchanged.
  it("ignores a toggle of a locked id", () => {
    const previous = ["listenTime"] as const;
    expect(columnSelection(previous, available, locked, { type: "toggle", id: "streams" })).toBe(
      previous,
    );
  });
});

describe("normalizeColumnSelection", () => {
  const available: OptionalColumnId[] = ["streams", "listenTime"];

  // A list that names every available column is the default.
  // Input: that list, and a shorter list, and an empty list.
  // Expected: null, the short list, and the empty list.
  it("collapses an exact full list and keeps Clear", () => {
    expect(normalizeColumnSelection(["listenTime", "streams"], available)).toBeNull();
    expect(normalizeColumnSelection(["listenTime"], available)).toEqual(["listenTime"]);
    expect(normalizeColumnSelection([], available)).toEqual([]);
  });
});
