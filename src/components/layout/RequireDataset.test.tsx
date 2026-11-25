/**
 * Tests for the dataset route guard. Parsing stays on the page and shows
 * progress. Empty and error visits go back to the upload route.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { DatasetContextValue } from "@/state/useDataset";
import { DatasetContext } from "@/state/useDataset";
import { RequireDataset } from "./RequireDataset";

describe("RequireDataset", () => {
  // A data route with no dataset sends the user home.
  // Input: status empty, starting at /graphs.
  // Expected: the main heading, and not the graphs heading.
  it("redirects to the main page when the visit is empty", () => {
    renderGuard({ status: "empty", isReady: false });
    expect(screen.getByRole("heading", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Graphs" })).not.toBeInTheDocument();
  });

  // A failed parse has no dataset, so the data route is not shown.
  // Input: status error, starting at /graphs.
  // Expected: the main heading.
  it("redirects to the main page when parsing failed", () => {
    renderGuard({ status: "error", isReady: false, error: "The files could not be read." });
    expect(screen.getByRole("heading", { name: "Main" })).toBeInTheDocument();
  });

  // Startup must not bounce a refresh of a data page.
  // Input: status parsing and no file progress yet.
  // Expected: the saved-data sentence, and neither page heading.
  it("shows the startup message while parsing", () => {
    renderGuard({ status: "parsing", isReady: false, progress: null });
    expect(screen.getByRole("status")).toHaveTextContent("Loading saved data…");
    expect(screen.queryByRole("heading", { name: "Graphs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Main" })).not.toBeInTheDocument();
  });

  // An upload in progress shows the file count and the file that just finished.
  // Input: progress 3 of 12 for one audio file.
  // Expected: that count and the file name, without mounting the page.
  it("shows file progress while an upload is parsing", () => {
    renderGuard({
      status: "parsing",
      isReady: false,
      progress: {
        done: 3,
        total: 12,
        fileName: "Streaming_History_Audio_2016.json",
      },
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Reading files… 3 of 12");
    expect(status).toHaveTextContent("Streaming_History_Audio_2016.json");
    expect(screen.queryByRole("heading", { name: "Graphs" })).not.toBeInTheDocument();
  });

  // A loaded dataset renders the child route.
  // Input: status ready and isReady.
  // Expected: the graphs heading.
  it("renders the page when the dataset is ready", () => {
    renderGuard({ status: "ready", isReady: true });
    expect(screen.getByRole("heading", { name: "Graphs" })).toBeInTheDocument();
  });
});

/** Renders the guard at /graphs with a stand-in main page at /. */
function renderGuard(overrides: Partial<DatasetContextValue>) {
  render(
    <DatasetContext.Provider value={{ ...idleValue(), ...overrides }}>
      <MemoryRouter initialEntries={["/graphs"]}>
        <Routes>
          <Route path="/" element={<h1>Main</h1>} />
          <Route element={<RequireDataset />}>
            <Route path="/graphs" element={<h1>Graphs</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </DatasetContext.Provider>,
  );
}

/** A context value with no dataset. Tests override the fields they care about. */
function idleValue(): DatasetContextValue {
  return {
    dataset: null,
    meta: null,
    status: "empty",
    error: null,
    sourceLabel: null,
    fileErrors: [],
    warnings: [],
    storageError: null,
    progress: null,
    isReady: false,
    filteredStreams: [],
    loadFiles: () => {},
    durable: false,
    saving: false,
    nothingSaved: false,
    writesSkipped: false,
    save: () => {},
    clearSaved: () => {},
  };
}
