/**
 * Tests for the Graphs page query string.
 * Repeated entity keys stay separate, and t=none means a category chart.
 */

import { describe, expect, it } from "vitest";
import { graphParamsMatch, graphQueryKey, parseGraphParams, queryFromKey, serializeGraphParams } from "./graphParams";
import { queriesEqual, type GraphQuery } from "./graphQuery";

function query(overrides: Partial<GraphQuery> = {}): GraphQuery {
  return {
    measure: "listenTime",
    timeBucket: "month",
    breakdown: "none",
    entityKeys: [],
    chart: "area",
    from: null,
    to: null,
    ...overrides,
  };
}

describe("serializeGraphParams", () => {
  // A category chart has to be able to round-trip a null time bucket.
  // Input: hour of day, plus two entity keys that contain a comma.
  // Expected: t=none, and two e params, not one comma-joined value.
  it("writes t=none and one e param per key", () => {
    const params = serializeGraphParams(
      query({
        measure: "streams",
        timeBucket: null,
        breakdown: "artist",
        chart: "line",
        entityKeys: ["a,b", "c"],
      }),
    );
    expect(params.get("t")).toBe("none");
    expect(params.get("m")).toBe("streams");
    expect(params.get("b")).toBe("artist");
    expect(params.get("c")).toBe("bar");
    expect(params.getAll("e")).toEqual(["a,b", "c"]);
  });
});

describe("parseGraphParams", () => {
  // The written params come back as the same query.
  // Input: a serialized artist chart with two keys and a date.
  // Expected: the same fields, including key order.
  it("reads a serialized query back", () => {
    const original = query({
      breakdown: "artist",
      chart: "line",
      entityKeys: ["ada", "bea"],
      from: "2020-01-01",
      to: "2020-06-01",
    });
    expect(parseGraphParams(serializeGraphParams(original))).toEqual(original);
  });

  // A day outside the dataset is the same as leaving that side open.
  // Input: from=1990-01-01 on a dataset that starts in 2020.
  // Expected: from is null.
  it("stores a date on the dataset edge as null", () => {
    const params = serializeGraphParams(query({ from: "1990-01-01" }));
    const parsed = parseGraphParams(params, {
      minEndedAt: "2020-06-15T18:00:00.000Z",
      maxEndedAt: "2020-06-15T18:00:00.000Z",
    });
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBeNull();
  });
});

describe("graphParamsMatch", () => {
  // get() would hide a second e param. Matching uses every value.
  // Input: one string with two e params, and one with a single joined e.
  // Expected: they do not match.
  it("treats repeated keys as ordered lists", () => {
    const split = new URLSearchParams("e=a&e=b");
    const joined = new URLSearchParams("e=a,b");
    expect(graphParamsMatch(split, new URLSearchParams("e=a&e=b"))).toBe(true);
    expect(graphParamsMatch(split, joined)).toBe(false);
  });
});

describe("graphQueryKey", () => {
  // Equal queries share a key, and the key parses back to that query.
  // Input: the same fields on two objects.
  // Expected: one key, and queryFromKey returns those fields.
  it("round-trips a query through the key string", () => {
    const left = query({ breakdown: "artist", entityKeys: ["ada"] });
    const right = query({ breakdown: "artist", entityKeys: ["ada"] });
    expect(graphQueryKey(left)).toBe(graphQueryKey(right));
    expect(queriesEqual(queryFromKey(graphQueryKey(left)), left)).toBe(true);
  });
});
