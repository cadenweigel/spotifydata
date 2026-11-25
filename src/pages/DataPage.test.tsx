/**
 * Tests for the Data page: sort, paging, columns, search, and the
 * albums empty state. Each case loads a dataset through the memory store.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { formatDate, formatInt } from "@/data/format";
import type { Dataset, Stream } from "@/data/types";
import { DatasetProvider } from "@/state/DatasetProvider";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import { PREFS_KEY } from "@/state/prefsStorage";
import { PrefsProvider } from "@/state/PrefsProvider";
import { DataPage } from "./DataPage";

describe("DataPage", () => {
  // The default table is the artists with the most streams, across every year.
  // Input: Big has three plays in 2019 and 2024, Small has one, a short play, a podcast.
  // Expected: Big then Small. The short play and the podcast are absent.
  // Streams and listen time are both on the table.
  it("ranks artists by streams across the whole history", async () => {
    renderData("/data/artists", sampleDataset());

    expect(await screen.findByRole("table", { name: "Top artists by streams" })).toBeInTheDocument();
    expect(document.title).toBe("Artists · Spotify Data");
    expect(screen.getByRole("columnheader", { name: "Streams" }).className).toMatch(/numeric/);
    expect(screen.getByRole("columnheader", { name: "Listen time" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Skip rate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Streams" })).not.toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    const big = within(rows[1]).getAllByRole("cell");
    expect(big[1]).toHaveTextContent("Big");
    expect(big[2]).toHaveTextContent("3");
    expect(big[3]).toHaveTextContent("4m");
    expect(within(rows[2]).getByRole("cell", { name: "Small" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Short" })).not.toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Show" })).not.toBeInTheDocument();
    expect(
      screen.getByText(`Showing ${formatInt(1)}\u2013${formatInt(2)} of ${formatInt(2)} artists`),
    ).toBeInTheDocument();
  });

  // Listen time as the sort locks that column and leaves streams optional.
  // Input: the same artists opened with sort=listenTime.
  // Expected: both columns, and the listen-time checkbox cannot be cleared.
  it("locks listen time and still shows streams by default", async () => {
    const user = userEvent.setup();
    renderData("/data/artists?sort=listenTime", sampleDataset());

    expect(
      await screen.findByRole("table", { name: "Top artists by listen time" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Streams" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getByRole("checkbox", { name: /Listen time/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Streams" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Artist" })).toBeDisabled();
  });

  // Choosing alphabetical writes the query and still locks the name.
  // Input: open artists, choose Alphabetical, open columns, click the name box.
  // Expected: sort=alpha, and the Artist checkbox stays checked.
  it("puts alpha in the query string and keeps the name column locked", async () => {
    const user = userEvent.setup();
    const { router } = renderData("/data/artists", sampleDataset());
    expect(await screen.findByRole("heading", { name: "Artists" })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "alpha");
    await waitFor(() => {
      expect(router.state.location.search).toContain("sort=alpha");
    });
    expect(
      screen.getByRole("table", { name: "Artists in alphabetical order" }),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByRole("cell", { name: "Big" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columns" }));
    const name = screen.getByRole("checkbox", { name: "Artist" });
    expect(name).toBeChecked();
    expect(name).toBeDisabled();
    await user.click(name);
    expect(name).toBeChecked();

    await router.navigate(-1);
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Sort" })).toHaveValue("streams");
    });
    expect(router.state.location.search).not.toContain("sort=alpha");
  });

  // Page 2 of 100 starts at rank 101. Page size 25 shows 25 rows.
  // Clear leaves rank, name, and the sort column.
  // Input: 250 artists, one play each.
  // Expected: those three checks, in that order.
  it("pages 250 artists and clears optional columns", async () => {
    const user = userEvent.setup();
    renderData("/data/artists", manyArtists(250));

    expect(await screen.findByRole("cell", { name: "Artist 001" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    const pageTwo = await screen.findByRole("cell", { name: "Artist 101" });
    const row = pageTwo.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByRole("cell")[0]).toHaveTextContent("101");

    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "25");
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(26);
    });
    expect(screen.getByRole("cell", { name: "Artist 001" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "#",
      "Artist",
      "Streams",
    ]);
    expect(screen.getByRole("checkbox", { name: /Streams/ })).toBeDisabled();
  });

  // A filter goes back to page 1 and ranks the matches from 1.
  // A query that matches nothing offers a reset, which restores the list.
  // Input: page 2 of 250 artists, then "Artist 050", then a query of zzzz.
  // Expected: rank 1 for Artist 050, then the empty message, then Artist 001 again.
  it("restarts ranks when the filter changes and can reset", async () => {
    const user = userEvent.setup();
    renderData("/data/artists", manyArtists(250));
    expect(await screen.findByRole("cell", { name: "Artist 001" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("cell", { name: "Artist 101" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Filter" }), "Artist 050");
    const match = await screen.findByRole("cell", { name: "Artist 050" });
    const matchRow = match.closest("tr");
    expect(within(matchRow as HTMLElement).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(
      screen.getByText(`Showing ${formatInt(1)} of ${formatInt(1)} artists`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Artist 101" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(await screen.findByRole("cell", { name: "Artist 001" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Filter" }), "zzzz");
    expect(await screen.findByRole("heading", { name: "Nothing matches this filter" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(await screen.findByRole("cell", { name: "Artist 001" })).toBeInTheDocument();
  });

  // A page past the end shows the last page.
  // Input: 250 artists and page=99.
  // Expected: rank 201, Artist 201, and the last range sentence.
  it("clamps a page past the end to the last page", async () => {
    renderData("/data/artists?page=99", manyArtists(250));
    const cell = await screen.findByRole("cell", { name: "Artist 201" });
    const row = cell.closest("tr");
    expect(within(row as HTMLElement).getAllByRole("cell")[0]).toHaveTextContent("201");
    expect(
      screen.getByText(
        `Showing ${formatInt(201)}\u2013${formatInt(250)} of ${formatInt(250)} artists`,
      ),
    ).toBeInTheDocument();
  });

  // Kind links keep sort and search, and drop page and columns.
  // Songs show the artist and the album. Albums show the artist.
  // Input: artists opened with sort, page, cols, and a query.
  // Expected: the albums link omits page and cols. Song and album subtitles match.
  it("keeps the view across kinds and shows song and album subtitles", async () => {
    const user = userEvent.setup();
    renderData("/data/artists?sort=alpha&page=3&cols=listenTime&q=Big", sampleDataset());

    const albums = await screen.findByRole("link", { name: "Albums" });
    const href = albums.getAttribute("href") ?? "";
    expect(href).toContain("/data/albums");
    expect(href).toContain("sort=alpha");
    expect(href).toContain("q=Big");
    expect(href).not.toContain("page=");
    expect(href).not.toContain("cols=");
    expect(screen.getByRole("link", { name: "Artists" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "Songs" }));
    expect(await screen.findByRole("heading", { name: "Songs" })).toBeInTheDocument();
    expect(screen.getByTitle("One — Big \u2014 First")).toHaveTextContent("Big \u2014 First");

    await user.click(screen.getByRole("link", { name: "Albums" }));
    expect(await screen.findByTitle("First — Big")).toBeInTheDocument();
  });

  // Local files have no album names. Artists and songs still list.
  // Input: one play with a null album.
  // Expected: the albums message, then the artist and the song on their own tabs.
  it("says when the export has no albums", async () => {
    const user = userEvent.setup();
    renderData("/data/albums", localFiles());

    expect(
      await screen.findByRole("heading", { name: "No album information in this data" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nothing matches this filter" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Artists" }));
    expect(await screen.findByRole("cell", { name: "Local" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Songs" }));
    expect(await screen.findByTitle("Demo — Local")).toBeInTheDocument();
  });

  // Narrowing the dates shows Reset dates. Resetting brings the other artists back.
  // Input: the sample, From moved to the same day as To.
  // Expected: the reset control, then both artists after the click.
  it("resets a narrowed date range", async () => {
    const user = userEvent.setup();
    renderData("/data/artists", sampleDataset());
    expect(await screen.findByRole("cell", { name: "Big" })).toBeInTheDocument();

    const to = screen.getByLabelText("To") as HTMLInputElement;
    fireEvent.change(screen.getByLabelText("From"), { target: { value: to.value } });
    expect(await screen.findByRole("button", { name: "Reset dates" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset dates" }));
    expect(await screen.findByRole("cell", { name: "Small" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset dates" })).not.toBeInTheDocument();
  });

  // A restored visit opened on a sorted URL shows that sort.
  // Input: the sample at /data/artists?sort=firstStream.
  // Expected: oldest first, which is Big, whose first play is the earliest.
  it("opens a saved URL on the sort it names", async () => {
    renderData("/data/artists?sort=firstStream", sampleDataset());
    const table = await screen.findByRole("table", { name: "Artists by first stream" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByRole("cell", { name: "Big" })).toBeInTheDocument();
    expect(within(rows[1]).getByRole("cell", { name: formatDate("2019-03-01T15:00:00.000Z") })).toBeInTheDocument();
  });
});

function renderData(path: string, dataset: Dataset) {
  localStorage.removeItem(PREFS_KEY);
  const store = memoryDatasetStore({ schemaVersion: 1, durable: true, dataset });
  const router = createMemoryRouter(
    [
      {
        path: "/data/:kind",
        element: (
          <PrefsProvider>
            <DatasetProvider store={store}>
              <DataPage />
            </DatasetProvider>
          </PrefsProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

function sampleDataset(): Dataset {
  return datasetFrom([
    play({
      id: 0,
      artist: "Big",
      track: "One",
      album: "First",
      endedAt: "2019-03-01T15:00:00.000Z",
      msPlayed: 60_000,
    }),
    play({
      id: 1,
      artist: "Big",
      track: "Two",
      album: "First",
      endedAt: "2024-01-02T15:00:00.000Z",
      msPlayed: 120_000,
    }),
    play({
      id: 2,
      artist: "Big",
      track: "Three",
      album: "Second",
      endedAt: "2024-08-03T15:00:00.000Z",
      msPlayed: 60_000,
    }),
    play({
      id: 3,
      artist: "Small",
      track: "Only",
      album: "Solo",
      endedAt: "2022-05-05T15:00:00.000Z",
      msPlayed: 90_000,
    }),
    play({
      id: 4,
      artist: "Short",
      track: "Skip",
      album: "Nope",
      endedAt: "2021-01-01T15:00:00.000Z",
      msPlayed: 5_000,
    }),
    play({
      id: 5,
      artist: "Show",
      track: "Episode",
      album: "Podcast",
      endedAt: "2023-01-01T15:00:00.000Z",
      msPlayed: 60_000,
      isPodcast: true,
    }),
  ]);
}

/** One play per artist, so stream count ties break by name. */
function manyArtists(count: number): Dataset {
  const streams = Array.from({ length: count }, (_, index) => {
    const label = String(index + 1).padStart(3, "0");
    return play({
      id: index,
      artist: `Artist ${label}`,
      track: `Track ${label}`,
      album: `Album ${label}`,
      endedAt: new Date(2020, 0, 1, 12, 0, index).toISOString(),
    });
  });
  return datasetFrom(streams);
}

function localFiles(): Dataset {
  return datasetFrom([play({ id: 0, artist: "Local", track: "Demo", album: null })]);
}

function datasetFrom(streams: Stream[]): Dataset {
  const ordered = [...streams].sort((a, b) => (a.endedAt < b.endedAt ? -1 : a.endedAt > b.endedAt ? 1 : 0));
  return {
    meta: {
      streamCount: ordered.length,
      musicCount: ordered.filter((stream) => !stream.isPodcast).length,
      podcastCount: ordered.filter((stream) => stream.isPodcast).length,
      ignoredVideoFiles: 0,
      minEndedAt: ordered[0]?.endedAt ?? null,
      maxEndedAt: ordered[ordered.length - 1]?.endedAt ?? null,
      sourceFiles: ["history.json"],
    },
    streams: ordered,
  };
}

function play(overrides: Partial<Stream> & Pick<Stream, "id" | "artist" | "track">): Stream {
  return {
    endedAt: "2020-06-15T18:00:00.000Z",
    msPlayed: 60_000,
    album: "Album",
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
