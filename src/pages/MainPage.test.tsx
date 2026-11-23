/**
 * Smoke test for the home page. It renders the placeholder heading inside a router.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MainPage } from "@/pages/MainPage";

describe("MainPage", () => {
  // Renders the placeholder main page inside a router.
  // Input: MainPage with no dataset loaded.
  // Expected: a heading whose text is "Main".
  it("renders its title", () => {
    render(
      <MemoryRouter>
        <MainPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Main" })).toBeInTheDocument();
  });
});
