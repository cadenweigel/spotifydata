import { describe, expect, it } from "vitest";
import { formatDuration, formatInt } from "@/data/format";

describe("formatDuration", () => {
  it("formats zero as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  it("formats under one minute", () => {
    expect(formatDuration(30_000)).toBe("<1m");
  });
});

describe("formatInt", () => {
  it("formats with locale grouping", () => {
    expect(formatInt(1000)).toMatch(/1[,.]?000/);
  });
});
