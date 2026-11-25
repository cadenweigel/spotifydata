/**
 * Tests for the home page. The heading is always there. Save and Forget
 * appear once a dataset is loaded.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Dataset } from "@/data/types";
import { NOTHING_SAVED_MESSAGE } from "@/state/datasetReducer";
import { DatasetProvider } from "@/state/DatasetProvider";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import { MainPage } from "@/pages/MainPage";

describe("MainPage", () => {
  // Renders the home page before a dataset is loaded.
  // Input: MainPage with an empty store.
  // Expected: a heading whose text is "Main", and no save button yet.
  it("renders its title", async () => {
    render(
      <MemoryRouter>
        <DatasetProvider store={memoryDatasetStore()}>
          <MainPage />
        </DatasetProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save on this browser" })).not.toBeInTheDocument();
  });

  // Save marks the record durable, and Forget removes it.
  // Input: a session record already in the store.
  // Expected: the hint becomes "Saved on this browser.", then Forget shows the empty sentence.
  it("saves the dataset and then forgets it", async () => {
    const user = userEvent.setup();
    const store = memoryDatasetStore({
      schemaVersion: 1,
      durable: false,
      dataset: makeDataset(),
    });
    store.setVisitFlag();

    render(
      <MemoryRouter>
        <DatasetProvider store={store}>
          <MainPage />
        </DatasetProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "This stays in this tab. A refresh brings it back. Closing the tab forgets it.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save on this browser" }));
    expect(await screen.findByText("Saved on this browser.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save on this browser" })).not.toBeInTheDocument();
    expect(store.read()?.durable).toBe(true);

    await user.click(screen.getByRole("button", { name: "Forget this data" }));
    expect(await screen.findByText(NOTHING_SAVED_MESSAGE)).toBeInTheDocument();
    expect(store.read()).toBeNull();
    expect(screen.queryByRole("button", { name: "Forget this data" })).not.toBeInTheDocument();
  });
});

/** A one-stream dataset, enough for Save to have something to store. */
function makeDataset(): Dataset {
  return {
    meta: {
      streamCount: 1,
      musicCount: 1,
      podcastCount: 0,
      ignoredVideoFiles: 0,
      minEndedAt: "2020-01-01T00:00:00.000Z",
      maxEndedAt: "2020-01-01T00:00:00.000Z",
      sourceFiles: ["Streaming_History_Audio_2019.json"],
    },
    streams: [
      {
        id: 0,
        endedAt: "2020-01-01T00:00:00.000Z",
        msPlayed: 30_000,
        artist: "Artist",
        album: null,
        track: "Song",
        trackUri: null,
        isPodcast: false,
        platform: null,
        country: null,
        reasonStart: null,
        reasonEnd: null,
        shuffle: null,
        skipped: null,
        offline: null,
        incognito: null,
      },
    ],
  };
}
