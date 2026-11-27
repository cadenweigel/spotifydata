/**
 * Tests for the chart contract. The chart sanitizes its query, stays off
 * the URL, and two copies on one page do not share an empty state.
 */

import { screen, waitFor } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { defaultGraphQuery, type GraphQuery } from "@/data/graph/graphQuery";
import type { Stream } from "@/data/types";
import { renderWithProviders } from "@/test/renderWithProviders";
import { GraphChart } from "./GraphChart";

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

const plays = [
  play({ id: 1, artist: "Ada", track: "One" }),
  play({ id: 2, artist: "Bea", track: "Two" }),
];

describe("GraphChart", () => {
  // A range with no plays does not draw axes.
  // Input: two 2020 plays and a query locked to 1990.
  // Expected: the empty sentence, and no summary.
  it("says there are no streams when the range is empty", () => {
    renderWithProviders(
      <GraphChart
        query={{ ...defaultGraphQuery(), from: "1990-01-01", to: "1990-01-02" }}
        streams={plays}
      />,
    );
    expect(screen.getByText("No streams in this range")).toBeInTheDocument();
    expect(screen.queryByText(/Listen time ·/)).not.toBeInTheDocument();
  });

  // An illegal unique count is drawn as streams.
  // Input: unique artists with no time bucket, and one play.
  // Expected: a Streams summary, and no thrown error.
  it("renders a unique-count category query as streams", () => {
    const illegal: GraphQuery = {
      measure: "uniqueArtists",
      timeBucket: null,
      breakdown: "none",
      entityKeys: [],
      chart: "area",
      from: null,
      to: null,
    };
    renderWithProviders(<GraphChart query={illegal} streams={plays.slice(0, 1)} />);
    expect(screen.getByText(/Streams ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Unique artists/)).not.toBeInTheDocument();
  });

  // Compact drops the summary and the legend.
  // Input: two artists over time, compact.
  // Expected: neither artist is a legend button, and there is no summary.
  it("hides the legend and the summary when compact", () => {
    renderWithProviders(
      <GraphChart
        compact
        query={{ ...defaultGraphQuery(), breakdown: "artist", chart: "line" }}
        streams={plays}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bea" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Listen time ·/)).not.toBeInTheDocument();
  });

  // Embedding the chart on another route leaves that route's query alone.
  // Input: a chart rendered at /data/artists?sort=alpha.
  // Expected: the search string is still sort=alpha after the chart paints.
  it("does not change the page search params", async () => {
    renderWithProviders(
      <>
        <SearchProbe />
        <GraphChart query={defaultGraphQuery()} streams={plays} />
      </>,
      { route: "/data/artists?sort=alpha" },
    );
    expect(screen.getByText(/Listen time ·/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("search").textContent).toBe("?sort=alpha");
    });
  });

  // Two charts on one page keep their own points.
  // Input: one open query and one query locked to 1990, same plays.
  // Expected: one summary and one empty sentence.
  it("renders two queries independently", () => {
    renderWithProviders(
      <>
        <GraphChart query={defaultGraphQuery()} streams={plays} />
        <GraphChart
          query={{ ...defaultGraphQuery(), from: "1990-01-01", to: "1990-01-02" }}
          streams={plays}
        />
      </>,
    );
    expect(screen.getByText(/Listen time ·/)).toBeInTheDocument();
    expect(screen.getAllByText("No streams in this range")).toHaveLength(1);
  });
});

function SearchProbe() {
  const location = useLocation();
  return <p data-testid="search">{location.search}</p>;
}
