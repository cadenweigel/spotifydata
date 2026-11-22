import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MainPage } from "@/pages/MainPage";

describe("MainPage", () => {
  it("renders its title", () => {
    render(
      <MemoryRouter>
        <MainPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Main" })).toBeInTheDocument();
  });
});
