/**
 * Tests for reading and writing the Data page query string.
 * Dates are local calendar days, so the fixtures use the local Date
 * constructor and then store UTC instants, the same form as endedAt.
 */

import { describe, expect, it } from "vitest";
import type { DatasetMeta, EntityKind } from "@/data/types";
import {
  datasetDateRange,
  parseDataParams,
  searchParamsMatch,
  serializeDataParams,
  type DataViewState,
} from "./dataParams";

function at(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

function meta(min: string | null, max: string | null): DatasetMeta {
  return {
    streamCount: 1,
    musicCount: 1,
    podcastCount: 0,
    ignoredVideoFiles: 0,
    minEndedAt: min,
    maxEndedAt: max,
    sourceFiles: [],
  };
}

const rangeMeta = meta(at(2020, 1, 15), at(2024, 6, 2));

function parse(search: string, kind: EntityKind = "artist", source: DatasetMeta = rangeMeta) {
  return parseDataParams(new URLSearchParams(search), source, kind);
}

describe("parseDataParams", () => {
  // An empty query is the default view.
  // Input: no params, and a dataset with a date range.
  // Expected: streams, page 1, 100 rows, every column, no text, full range.
  it("fills defaults and does not throw on garbage", () => {
    expect(parse("")).toEqual({
      sort: "streams",
      page: 1,
      pageSize: 100,
      cols: null,
      q: "",
      from: null,
      to: null,
    });
    expect(parse("sort=&page=0&pageSize=7&cols=nope&from=yesterday&to=2021-02-31")).toEqual({
      sort: "streams",
      page: 1,
      pageSize: 100,
      cols: [],
      q: "",
      from: null,
      to: null,
    });
  });

  // Each bad param falls back on its own. A valid neighbor is kept.
  // Input: a bad sort beside a valid page size, and a page of 99.
  // Expected: the default sort, page size 50, and page 99 left for later clamping.
  it("keeps valid params and replaces invalid ones", () => {
    expect(parse("sort=nope&pageSize=50").sort).toBe("streams");
    expect(parse("sort=nope&pageSize=50").pageSize).toBe(50);
    expect(parse("page=99").page).toBe(99);
    expect(parse("page=01").page).toBe(1);
    expect(parse("page=-3").page).toBe(1);
    expect(parse("sort=alpha").sort).toBe("alpha");
  });

  // Column ids the kind cannot show are dropped. Rank is not an optional id.
  // Input: cols mixing rank, streams, album counts, and an unknown id.
  // Expected: songs keep streams only. An empty cols param stays empty.
  it("drops column ids the kind cannot show", () => {
    expect(parse("cols=rank,streams,albumCount,nope", "track").cols).toEqual(["streams"]);
    expect(parse("cols=trackCount,albumCount", "album").cols).toEqual(["trackCount"]);
    expect(parse("cols=", "artist").cols).toEqual([]);
    expect(parse("cols=listenTime,streams", "artist").cols).toEqual(["streams", "listenTime"]);
  });

  // Days outside the dataset move to the nearest edge.
  // An edge day is the default, so it is stored as null and left out of the URL.
  // Input: a day before the start, a day after the end, and a day inside.
  // Expected: null, null, and the inside day.
  it("clamps dates to the dataset and treats the edges as the default", () => {
    const range = datasetDateRange(rangeMeta);
    expect(range).toEqual({ from: "2020-01-15", to: "2024-06-02" });
    expect(parse("from=1999-01-01").from).toBeNull();
    expect(parse("to=2099-01-01").to).toBeNull();
    expect(parse("from=2020-01-15&to=2024-06-02")).toMatchObject({ from: null, to: null });
    expect(parse("from=2021-06-01&to=2022-01-01")).toMatchObject({
      from: "2021-06-01",
      to: "2022-01-01",
    });
  });

  // A start after the end is kept when both days sit inside the dataset.
  // The date control refuses to apply that pair. A hand-written URL still parses.
  // Input: from after to, both inside the range.
  // Expected: both days, and no throw.
  it("keeps an inverted range that is inside the dataset", () => {
    expect(parse("from=2022-01-01&to=2021-06-01")).toMatchObject({
      from: "2022-01-01",
      to: "2021-06-01",
    });
  });

  // A blank query is the default. A query of spaces is blank after trim.
  // Input: q missing, q empty, and q of spaces.
  // Expected: an empty string each time. A real query is kept, spaces and all.
  it("treats a blank query as empty", () => {
    expect(parse("q=").q).toBe("");
    expect(parse("q=%20%20").q).toBe("");
    expect(parse("q=%20ab").q).toBe(" ab");
  });
});

describe("serializeDataParams", () => {
  const state: DataViewState = {
    sort: "alpha",
    page: 2,
    pageSize: 25,
    cols: ["listenTime"],
    q: "ab",
    from: "2021-06-01",
    to: "2022-01-01",
  };

  // Defaults stay out of the URL so a link to the plain table is short.
  // Input: the default state, then one non-default field at a time.
  // Expected: an empty query, then that one param.
  it("omits values that equal the default", () => {
    const defaults: DataViewState = {
      sort: "streams",
      page: 1,
      pageSize: 100,
      cols: null,
      q: "",
      from: null,
      to: null,
    };
    expect(serializeDataParams(defaults, rangeMeta, "artist").toString()).toBe("");
    expect(serializeDataParams({ ...defaults, sort: "alpha" }, rangeMeta, "artist").toString()).toBe(
      "sort=alpha",
    );
    expect(serializeDataParams({ ...defaults, page: 2 }, rangeMeta, "artist").toString()).toBe(
      "page=2",
    );
  });

  // A filled-in view writes every param in a stable order.
  // Input: sort, page, page size, one column, a query, and both dates.
  // Expected: that query string, and a parse that returns the same state.
  it("writes a non-default view and round-trips it", () => {
    const params = serializeDataParams(state, rangeMeta, "artist");
    expect(params.toString()).toBe(
      "sort=alpha&page=2&pageSize=25&cols=listenTime&q=ab&from=2021-06-01&to=2022-01-01",
    );
    expect(parseDataParams(params, rangeMeta, "artist")).toEqual(state);
  });

  // Clear has to survive a refresh, so an empty cols list is not omitted.
  // Input: cols set to an empty array.
  // Expected: a cols param whose value is empty.
  it("keeps an empty cols list", () => {
    const params = serializeDataParams(
      { ...state, cols: [], sort: "streams", page: 1, pageSize: 100, q: "", from: null, to: null },
      rangeMeta,
      "artist",
    );
    expect(params.get("cols")).toBe("");
    expect(parseDataParams(params, rangeMeta, "artist").cols).toEqual([]);
  });

  // A column the kind cannot show is not written back.
  // Input: album counts stored while the kind is songs.
  // Expected: cols is empty after a round trip.
  it("drops kind-invalid columns while writing", () => {
    const params = serializeDataParams(
      {
        sort: "streams",
        page: 1,
        pageSize: 100,
        cols: ["albumCount", "streams"],
        q: "",
        from: null,
        to: null,
      },
      rangeMeta,
      "track",
    );
    expect(params.get("cols")).toBe("streams");
  });
});

describe("searchParamsMatch", () => {
  // Order differs. The values do not.
  // Input: the same pairs in two orders, then one extra key.
  // Expected: a match, then no match. An empty value is not a missing key.
  it("compares values and ignores key order", () => {
    const a = new URLSearchParams("sort=alpha&q=ab");
    const b = new URLSearchParams("q=ab&sort=alpha");
    expect(searchParamsMatch(a, b)).toBe(true);
    expect(searchParamsMatch(a, new URLSearchParams("sort=alpha"))).toBe(false);
    expect(searchParamsMatch(new URLSearchParams("cols="), new URLSearchParams())).toBe(false);
  });
});
