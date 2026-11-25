/**
 * Tests for the nav summary: music plays above the threshold, and the date range.
 */

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Dataset, Stream } from "@/data/types";
import { formatDate } from "@/data/format";
import { FilterBar } from "@/components/layout/FilterBar";
import { NavBar } from "@/components/layout/NavBar";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import { renderWithProviders } from "@/test/renderWithProviders";

const FIRST = "2020-01-01T00:00:00.000Z";
const LAST = "2021-01-01T00:00:00.000Z";

describe("DatasetSummary", () => {
  // The nav counts music above the threshold, not podcasts and not short plays.
  // Input: one 60s music play, one 10s music play, one podcast, threshold 30s.
  // Expected: "1 stream" and the dataset's date range. All plays raises it to 2.
  it("counts music streams above the threshold", async () => {
    const user = userEvent.setup();
    const store = memoryDatasetStore({
      schemaVersion: 1,
      durable: false,
      dataset: sampleDataset(),
    });
    store.setVisitFlag();
    renderWithProviders(
      <>
        <NavBar />
        <FilterBar />
      </>,
      { store },
    );

    const range = `${formatDate(FIRST)} – ${formatDate(LAST)}`;
    expect(await screen.findByText(`1 stream · ${range}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data" })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Listen time" }), "0");
    expect(screen.getByText(`2 streams · ${range}`)).toBeInTheDocument();
  });

  // No dataset means no summary and no section links.
  // Input: an empty store.
  // Expected: the brand link, and no Data link.
  it("hides the section links when nothing is loaded", async () => {
    renderWithProviders(<NavBar />);
    expect(await screen.findByRole("link", { name: "Spotify Data" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Data" })).not.toBeInTheDocument();
    expect(screen.queryByText(/stream/)).not.toBeInTheDocument();
  });
});

/** Two music plays and one podcast. The short music play is under 30 seconds. */
function sampleDataset(): Dataset {
  return {
    meta: {
      streamCount: 3,
      musicCount: 2,
      podcastCount: 1,
      ignoredVideoFiles: 0,
      minEndedAt: FIRST,
      maxEndedAt: LAST,
      sourceFiles: ["Streaming_History_Audio_2020.json"],
    },
    streams: [
      play({ id: 0, endedAt: FIRST, msPlayed: 60_000 }),
      play({ id: 1, endedAt: "2020-06-01T00:00:00.000Z", msPlayed: 10_000 }),
      play({
        id: 2,
        endedAt: LAST,
        msPlayed: 60_000,
        artist: "Show",
        track: "Episode",
        isPodcast: true,
      }),
    ],
  };
}

/** One play. Defaults are a music row long enough to pass the 30 second threshold. */
function play(overrides: Partial<Stream> & Pick<Stream, "id">): Stream {
  return {
    endedAt: FIRST,
    msPlayed: 60_000,
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
    ...overrides,
  };
}
