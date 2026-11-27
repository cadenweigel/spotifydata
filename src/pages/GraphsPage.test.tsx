/**
 * Tests for the Graphs page. Presets write the query string, and the
 * over-time toggle remembers the chart it turned off.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Dataset, Stream } from "@/data/types";
import { DatasetProvider } from "@/state/DatasetProvider";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import { PREFS_KEY } from "@/state/prefsStorage";
import { PrefsProvider } from "@/state/PrefsProvider";
import { GraphsPage } from "./GraphsPage";

describe("GraphsPage", () => {
  // A visit with no query string opens Listening over time.
  // Input: /graphs and one play.
  // Expected: the preset is pressed, and the URL has the four chart params.
  it("seeds a bare visit from Listening over time", async () => {
    const router = renderGraphs("/graphs", onePlay());
    expect(await screen.findByRole("heading", { name: "Graphs" })).toBeInTheDocument();
    await waitFor(() => {
      const search = router.state.location.search;
      expect(search).toContain("m=listenTime");
      expect(search).toContain("t=month");
      expect(search).toContain("b=none");
      expect(search).toContain("c=area");
    });
    expect(screen.getByRole("button", { name: "Listening over time" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Streams per year replaces the measure and the bucket.
  // Input: click Streams per year.
  // Expected: m=streams and t=year.
  it("writes Streams per year into the URL", async () => {
    const user = userEvent.setup();
    const router = renderGraphs("/graphs", onePlay());
    expect(await screen.findByRole("heading", { name: "Graphs" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Streams per year" }));
    await waitFor(() => {
      const search = router.state.location.search;
      expect(search).toContain("m=streams");
      expect(search).toContain("t=year");
    });
  });

  // Hour of day is a category chart.
  // Input: click Hour of day.
  // Expected: t=none, b=hour, and Compare categories is pressed.
  it("turns Over time off for Hour of day", async () => {
    const user = userEvent.setup();
    const router = renderGraphs("/graphs", onePlay());
    expect(await screen.findByRole("heading", { name: "Graphs" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hour of day" }));
    await waitFor(() => {
      const search = router.state.location.search;
      expect(search).toContain("t=none");
      expect(search).toContain("b=hour");
    });
    expect(screen.getByRole("button", { name: "Compare categories" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Weekday while a time chart is showing explains why Over time turned off.
  // Input: start on Listening over time, then choose Weekday.
  // Expected: the note, t=none, then Over time restores month and area.
  it("restores the time chart after a weekday breakdown", async () => {
    const user = userEvent.setup();
    const router = renderGraphs("/graphs", onePlay());
    expect(await screen.findByRole("heading", { name: "Graphs" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Listening over time" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Breakdown" }), "weekday");
    expect(
      screen.getByText("Hour and weekday are categories, so Over time is off."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.search).toContain("t=none");
      expect(router.state.location.search).toContain("b=weekday");
    });

    await user.click(screen.getByRole("button", { name: "Over time" }));
    await waitFor(() => {
      const search = router.state.location.search;
      expect(search).toContain("t=month");
      expect(search).toContain("c=area");
      expect(search).toContain("b=none");
    });
    expect(screen.queryByText(/Hour and weekday/)).not.toBeInTheDocument();
  });

  // One artist focuses the search, and the chosen key stays out of prefs.
  // Input: click One artist, type Ada, press Enter.
  // Expected: the URL has e=ada and the saved query has no entity keys.
  it("focuses the search for One artist and keeps keys out of prefs", async () => {
    const user = userEvent.setup();
    const router = renderGraphs("/graphs", onePlay());
    expect(await screen.findByRole("heading", { name: "Graphs" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "One artist" }));
    const input = await screen.findByRole("combobox", { name: "Top 8" });
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    await user.type(input, "ada");
    await user.click(await screen.findByRole("option", { name: "Ada" }));
    await waitFor(() => {
      expect(router.state.location.search).toContain("e=ada");
    });
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as {
      graphQuery?: { entityKeys?: string[] };
    };
    expect(stored.graphQuery?.entityKeys).toEqual([]);
  });
});

function renderGraphs(path: string, dataset: Dataset) {
  localStorage.removeItem(PREFS_KEY);
  const store = memoryDatasetStore({ schemaVersion: 1, durable: true, dataset });
  const router = createMemoryRouter(
    [
      {
        path: "/graphs",
        element: (
          <PrefsProvider>
            <DatasetProvider store={store}>
              <GraphsPage />
            </DatasetProvider>
          </PrefsProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function onePlay(): Dataset {
  const stream = play({ id: 1, artist: "Ada", track: "One" });
  return {
    meta: {
      streamCount: 1,
      musicCount: 1,
      podcastCount: 0,
      ignoredVideoFiles: 0,
      minEndedAt: stream.endedAt,
      maxEndedAt: stream.endedAt,
      sourceFiles: ["history.json"],
    },
    streams: [stream],
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
