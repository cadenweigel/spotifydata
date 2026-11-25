/**
 * Tests for warning sentences and for grouping file errors.
 */

import { describe, expect, it } from "vitest";
import type { IngestWarning } from "@/data/types";
import {
  ERROR_PREVIEW_LIMIT,
  groupFileErrors,
  limitErrorGroups,
  warningSentence,
} from "./issueText";

describe("warningSentence", () => {
  // Each kind names the count and uses the singular for one.
  // Input: one of each warning kind.
  // Expected: the sentence for that kind.
  it("describes one of each warning", () => {
    const cases: [IngestWarning, string][] = [
      [
        { kind: "rejectedRows", count: 1, fileName: "a.json" },
        "1 row in a.json was skipped because a time or a name was missing.",
      ],
      [
        { kind: "clampedTimes", count: 2, fileName: "a.json" },
        "2 play times in a.json were below zero and were counted as zero.",
      ],
      [
        { kind: "ignoredVideoFiles", count: 1 },
        "1 video history file was skipped.",
      ],
      [
        { kind: "ignoredOtherFiles", count: 3 },
        "3 files were skipped because they are not streaming history.",
      ],
      [
        { kind: "unsupportedPastYearFiles", count: 1 },
        "1 past-year file was skipped. This app needs the extended streaming history.",
      ],
      [{ kind: "duplicateFiles", count: 2 }, "2 duplicate files were skipped."],
    ];
    for (const [warning, sentence] of cases) {
      expect(warningSentence(warning)).toBe(sentence);
    }
  });
});

describe("groupFileErrors", () => {
  // Two messages for one file stay together. A second file is its own group.
  // Input: a.json, b.json, a.json again.
  // Expected: a.json has both of its messages, in order, then b.json.
  it("groups by file name in first-seen order", () => {
    const groups = groupFileErrors([
      { fileName: "a.json", message: "one", index: 0 },
      { fileName: "b.json", message: "two", index: 1 },
      { fileName: "a.json", message: "three", index: 2 },
    ]);
    expect(groups).toEqual([
      {
        fileName: "a.json",
        items: [
          { message: "one", index: 0 },
          { message: "three", index: 2 },
        ],
      },
      { fileName: "b.json", items: [{ message: "two", index: 1 }] },
    ]);
  });

  // The preview keeps the first 10 messages and finishes a group early.
  // Input: 6 errors in a.json and 5 in b.json, limit 10.
  // Expected: all of a.json and the first 4 of b.json.
  it("caps the preview at the limit", () => {
    const items = Array.from({ length: 11 }, (_, index) => ({
      fileName: index < 6 ? "a.json" : "b.json",
      message: `Problem ${index}`,
      index,
    }));
    const shown = limitErrorGroups(groupFileErrors(items), ERROR_PREVIEW_LIMIT);
    expect(shown[0]?.items).toHaveLength(6);
    expect(shown[1]?.items.map((item) => item.message)).toEqual([
      "Problem 6",
      "Problem 7",
      "Problem 8",
      "Problem 9",
    ]);
  });
});
