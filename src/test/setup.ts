/**
 * Loaded once before the test suite. Registers DOM matchers such as
 * toBeInTheDocument, and unmounts rendered components after each test.
 * Vitest does not provide a global afterEach, so Testing Library does not
 * do that on its own. Tests of plain functions do not need to import this.
 */

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
