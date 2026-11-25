/**
 * Tests that the preferences hook refuses to run without its provider.
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePrefs } from "./usePrefs";

function Probe() {
  usePrefs();
  return null;
}

describe("usePrefs", () => {
  // A control rendered outside the provider should fail immediately.
  // Input: a component that calls the hook with no provider above it.
  // Expected: an error that names PrefsProvider.
  it("throws when it is used outside PrefsProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow("usePrefs must be used inside PrefsProvider");
  });
});
