/**
 * Tests for the listen-time control, including a custom number of seconds.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { Dataset } from "@/data/types";
import { DatasetProvider } from "@/state/DatasetProvider";
import { PrefsProvider } from "@/state/PrefsProvider";
import { PREFS_KEY } from "@/state/prefsStorage";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import { FilterBar } from "./FilterBar";

beforeEach(() => {
  localStorage.removeItem(PREFS_KEY);
});

describe("FilterBar", () => {
  // The default listen time is 30 seconds, with a custom choice beside it.
  // Input: nothing stored.
  // Expected: the select shows "30 seconds or more".
  it("starts at 30 seconds or more", () => {
    renderBar();
    expect(screen.getByRole("combobox", { name: "Listen time" })).toHaveValue("30000");
  });

  // Choosing a preset stores that threshold.
  // Input: the user picks "60 seconds or more".
  // Expected: the stored value is 60000.
  it("stores a preset listen time", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.selectOptions(screen.getByRole("combobox", { name: "Listen time" }), "60000");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "").streamThresholdMs).toBe(60_000);
  });

  // Custom is a whole number of seconds, stored as milliseconds.
  // Input: the user picks Custom and types 90.
  // Expected: the stored value is 90000 and the seconds field stays on screen.
  it("stores a custom number of seconds", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.selectOptions(screen.getByRole("combobox", { name: "Listen time" }), "custom");
    const seconds = screen.getByRole("spinbutton", { name: "Seconds" });
    await user.clear(seconds);
    await user.type(seconds, "90");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "").streamThresholdMs).toBe(90_000);
    expect(seconds).toHaveValue(90);
  });

  // Typing a preset amount leaves the custom field and selects that preset.
  // Input: Custom, then the digits 30.
  // Expected: the select shows "30 seconds or more" and the seconds field is gone.
  it("uses the matching preset when the custom seconds are 30", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.selectOptions(screen.getByRole("combobox", { name: "Listen time" }), "custom");
    const seconds = screen.getByRole("spinbutton", { name: "Seconds" });
    await user.clear(seconds);
    await user.type(seconds, "30");
    expect(screen.getByRole("combobox", { name: "Listen time" })).toHaveValue("30000");
    expect(screen.queryByRole("spinbutton", { name: "Seconds" })).not.toBeInTheDocument();
  });

  // The podcast checkbox writes the other preference.
  // Input: a click on Include podcasts, with no dataset loaded.
  // Expected: includePodcasts is true.
  it("stores the podcast choice", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("checkbox", { name: "Include podcasts" }));
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "").includePodcasts).toBe(true);
  });

  // A dataset with no podcasts explains why the checkbox cannot be used.
  // Input: a loaded dataset whose podcastCount is 0.
  // Expected: the checkbox is disabled and the explanation is shown.
  it("disables Include podcasts when the data has none", async () => {
    const store = memoryDatasetStore({
      schemaVersion: 1,
      durable: false,
      dataset: makeDataset(0),
    });
    store.setVisitFlag();
    renderBar(store);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Include podcasts" })).toBeDisabled();
    });
    expect(screen.getByText("This data has no podcasts.")).toBeInTheDocument();
  });
});

/** Renders the bar with both providers. A store with a visit flag loads that dataset. */
function renderBar(store = memoryDatasetStore()) {
  return render(
    <PrefsProvider>
      <DatasetProvider store={store}>
        <FilterBar />
      </DatasetProvider>
    </PrefsProvider>,
  );
}

/** A one-stream dataset with the given podcast count. */
function makeDataset(podcastCount: number): Dataset {
  return {
    meta: {
      streamCount: 1,
      musicCount: 1,
      podcastCount,
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
