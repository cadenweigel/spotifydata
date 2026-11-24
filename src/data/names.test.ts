/**
 * Tests for cleanName and nameKey. Inputs are synthetic strings, not export rows.
 */

import { describe, expect, it } from "vitest";
import { cleanName, nameKey } from "./names";

describe("cleanName", () => {
  // Collapses extra spaces and keeps the original casing for display.
  // Input: "  Led   Zeppelin  ".
  // Expected: "Led Zeppelin".
  it("trims and collapses whitespace without changing case", () => {
    expect(cleanName("  Led   Zeppelin  ")).toBe("Led Zeppelin");
  });

  // Treats a blank string as no name.
  // Input: spaces and a tab.
  // Expected: "".
  it("returns an empty string for blank input", () => {
    expect(cleanName(" \t ")).toBe("");
  });

  // Composes a decomposed accent so the same letter is one character.
  // Input: "e" plus a combining acute accent.
  // Expected: the single character "é".
  it("normalizes Unicode to NFC", () => {
    expect(cleanName("e\u0301")).toBe("\u00e9");
  });
});

describe("nameKey", () => {
  // Spacing and case differences share one grouping key.
  // Input: a spaced mixed-case name and the plain lowercase name.
  // Expected: both keys are "led zeppelin".
  it("gives extra whitespace and different case the same key", () => {
    expect(nameKey("  Led   Zeppelin  ")).toBe("led zeppelin");
    expect(nameKey("led zeppelin")).toBe("led zeppelin");
  });

  // A composed accent and a decomposed accent share one key.
  // Input: "é" and "e" plus a combining acute accent.
  // Expected: both keys are "é".
  it("treats composed and decomposed accents as the same key", () => {
    expect(nameKey("\u00e9")).toBe(nameKey("e\u0301"));
    expect(nameKey("e\u0301")).toBe("\u00e9");
  });
});
