/**
 * Tests that the data routes are behind the dataset guard, and that an
 * unknown path is not sent home.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App routes", () => {
  // No saved dataset means a data URL ends on the upload page.
  // Input: the app opened at /graphs.
  // Expected: the main heading, once startup finishes, and not the graphs heading.
  it("redirects a data route home when nothing is loaded", async () => {
    render(
      <MemoryRouter initialEntries={["/graphs"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Add your Spotify history" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Graphs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Data" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spotify Data" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Listen time" })).toBeInTheDocument();
  });

  // A file dragged onto the window must not navigate away. A text drag still can.
  // Input: a dragover whose type is Files, then one whose type is text.
  // Expected: only the file drag is cancelled.
  it("cancels a file drag on the window", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Add your Spotify history" });

    const fileDrag = new Event("dragover", { cancelable: true });
    Object.defineProperty(fileDrag, "dataTransfer", { value: { types: ["Files"] } });
    window.dispatchEvent(fileDrag);
    expect(fileDrag.defaultPrevented).toBe(true);

    const textDrag = new Event("dragover", { cancelable: true });
    Object.defineProperty(textDrag, "dataTransfer", { value: { types: ["text/plain"] } });
    window.dispatchEvent(textDrag);
    expect(textDrag.defaultPrevented).toBe(false);
  });

  // Unknown paths stay on the not-found page.
  // Input: the app opened at /nope.
  // Expected: the not-found heading.
  it("renders the not-found page for an unknown path", async () => {
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Listen time" })).not.toBeInTheDocument();
  });
});
