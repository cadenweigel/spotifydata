/**
 * Tests for the display helpers. These also prove the @ import alias works.
 */

import { describe, expect, it } from "vitest";
import { formatDuration, formatInt } from "@/data/format";

describe("formatDuration", () => {
  // Formats a duration of no time at all.
  // Input: 0 milliseconds.
  // Expected: "0m".
  it("formats zero as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  // Formats a play that is shorter than a minute.
  // Input: 30,000 milliseconds (30 seconds).
  // Expected: "<1m".
  it("formats under one minute", () => {
    expect(formatDuration(30_000)).toBe("<1m");
  });
});

describe("formatInt", () => {
  // Formats an integer with a thousands separator for the user's locale.
  // Input: 1000.
  // Expected: a string matching 1,000 or 1.000.
  it("formats with locale grouping", () => {
    expect(formatInt(1000)).toMatch(/1[,.]?000/);
  });
});
