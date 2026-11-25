/**
 * Tests that the dataset hook refuses to run without its provider.
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDataset } from "./useDataset";

function Probe() {
  useDataset();
  return null;
}

describe("useDataset", () => {
  // A page rendered outside the provider should fail immediately.
  // Input: a component that calls the hook with no provider above it.
  // Expected: an error that names DatasetProvider.
  it("throws when it is used outside DatasetProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      "useDataset must be used inside DatasetProvider",
    );
  });
});
