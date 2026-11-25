/**
 * Tests for the home page. The empty visit shows the drop zone. A loaded
 * visit shows the summary. A past-year upload stays on the empty visit.
 */

import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset, Stream } from "@/data/types";
import { formatDateTime, formatDuration, formatInt } from "@/data/format";
import { PAST_YEAR_EXPORT_MESSAGE } from "@/data/ingest/readFiles";
import { SPOTIFY_PRIVACY_URL } from "@/components/common/ExtendedHistoryLink";
import { FilterBar } from "@/components/layout/FilterBar";
import { NOTHING_SAVED_MESSAGE, REPLACE_EMPTY_MESSAGE } from "@/state/datasetReducer";
import { useDataset } from "@/state/useDataset";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import { renderWithProviders } from "@/test/renderWithProviders";
import { MainPage } from "@/pages/MainPage";

const AUDIO_ROW = {
  ts: "2020-06-01T12:00:00Z",
  ms_played: 60_000,
  master_metadata_track_name: "Song",
  master_metadata_album_artist_name: "Artist",
  master_metadata_album_album_name: "Album",
  spotify_track_uri: "spotify:track:abc",
};

describe("MainPage", () => {
  const NativeWorker = globalThis.Worker;

  beforeEach(() => {
    // The parse worker is not available here, so uploads run on the main thread.
    // Blob workers stay real so unzipping still works.
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (String(url).startsWith("blob:")) return new NativeWorker(url, options);
          throw new Error("no module worker");
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A new visit explains the upload and offers the drop zone.
  // Input: an empty store.
  // Expected: the drop zone, the past-year sentence, the privacy link, and the file list.
  it("renders the drop zone before a dataset is loaded", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainPage />);

    expect(
      await screen.findByRole("heading", { name: "Add your Spotify history" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Drop files here, or choose files" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload folder" })).toBeInTheDocument();
    expect(
      screen.getByText('The shorter past-year "account data" package is not supported yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Files are read in this browser and are never uploaded."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Spotify's privacy settings" });
    expect(link).toHaveAttribute("href", SPOTIFY_PRIVACY_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("button", { name: "Save on this browser" })).not.toBeInTheDocument();

    const details = screen.getByText("Which files do I need?").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Streaming_History_Audio_*.json")).toBeInTheDocument();
    await user.click(screen.getByText("Which files do I need?"));
    expect(details).toHaveAttribute("open");
  });

  // Save marks the record durable, and Forget removes it.
  // Input: a session record already in the store.
  // Expected: the hint becomes "Saved on this browser.", then Forget shows the empty sentence.
  it("saves the dataset and then forgets it", async () => {
    const user = userEvent.setup();
    const store = loadedStore(fixtureDataset());
    renderWithProviders(<MainPage />, { store });

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
    expect(
      screen.getByRole("heading", { name: "Add your Spotify history" }),
    ).toBeInTheDocument();
  });

  // The hub summarizes a loaded dataset, and the threshold changes the numbers.
  // Input: four streams, default threshold 30 seconds, then All plays.
  // Expected: 2 streams, 1 left out, then 3 streams and none left out.
  it("renders the summary from a loaded dataset", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <FilterBar />
        <MainPage />
      </>,
      { store: loadedStore(fixtureDataset()) },
    );

    expect(await screen.findByRole("heading", { name: "Your listening" })).toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(2));
    expect(termValue("Left out by listen time")).toBe(formatInt(1));
    expect(termValue("Total listen time")).toBe(formatDuration(180_000));
    expect(termValue("Artists")).toBe(formatInt(2));
    expect(termValue("Tracks")).toBe(formatInt(2));
    expect(termValue("Files")).toBe(formatInt(2));
    expect(termValue("First stream")).toBe(formatDateTime("2020-01-01T00:00:00.000Z"));
    expect(termValue("Last stream")).toBe(formatDateTime("2021-01-01T00:00:00.000Z"));
    expect(screen.getByText("1 podcast play is not included.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ranked tables/ })).toHaveAttribute("href", "/data");
    expect(screen.getByRole("link", { name: /not defined yet/ })).toHaveAttribute(
      "href",
      "/analysis",
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Listen time" }), "0");
    expect(termValue("Streams")).toBe(formatInt(3));
    expect(termValue("Left out by listen time")).toBe(formatInt(0));
    expect(termValue("Total listen time")).toBe(formatDuration(190_000));
  });

  // Only podcasts stay on the empty screen until the setting is turned on.
  // Input: a dataset with one podcast and no music, then the podcast checkbox.
  // Expected: the podcasts message, then the summary once podcasts are included.
  it("stays empty for a podcast-only export until podcasts are included", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <FilterBar />
        <MainPage />
      </>,
      { store: loadedStore(podcastDataset()) },
    );

    expect(await screen.findByRole("heading", { name: "Podcasts only" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Include podcasts" }));
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText("Podcasts are included in these numbers.")).toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(1));
  });

  // A past-year package does not load, and it gets its own explanation.
  // Input: one StreamingHistory_music file.
  // Expected: the dedicated sentence, the request link, and no summary.
  it("shows the past-year message and stays empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainPage />);
    expect(
      await screen.findByRole("button", { name: "Drop files here, or choose files" }),
    ).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("Choose JSON or zip files"),
      new File(["{}"], "StreamingHistory_music_0.json", { type: "application/json" }),
    );

    expect(await screen.findByText(PAST_YEAR_EXPORT_MESSAGE)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Request the extended streaming history" });
    expect(link).toHaveAttribute("href", SPOTIFY_PRIVACY_URL);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("heading", { name: "No streaming history found" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add your Spotify history" }),
    ).toBeInTheDocument();
  });

  // Video history is not a dataset. The empty screen says why nothing loaded.
  // Input: one video history file.
  // Expected: the generic causes, and the video warning.
  it("explains an upload that contained no streaming history", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainPage />);
    await screen.findByRole("button", { name: "Drop files here, or choose files" });
    await user.upload(
      screen.getByLabelText("Choose JSON or zip files"),
      new File(["[]"], "Streaming_History_Video_2020.json", { type: "application/json" }),
    );

    expect(await screen.findByRole("heading", { name: "No streaming history found" })).toBeInTheDocument();
    expect(screen.getByText(/only video or not listening history/)).toBeInTheDocument();
    expect(screen.getByText("1 video history file was skipped.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
  });

  // A corrupt audio file is named in the error list and does not open the hub.
  // Input: audio-named JSON that does not parse.
  // Expected: the file name and the invalid-JSON sentence, on the empty screen.
  it("lists a file error and stays empty when the audio is not JSON", async () => {
    const { load } = renderPage();
    await screen.findByRole("button", { name: "Drop files here, or choose files" });
    load([new File(["{"], "Streaming_History_Audio_2019.json", { type: "application/json" })]);

    expect(await screen.findByText("Streaming_History_Audio_2019.json")).toBeInTheDocument();
    expect(screen.getByText(/is not valid JSON/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No streaming history found" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
  });

  // A good audio file plus a video file loads, and the video note can be dismissed.
  // Input: one extended audio file and one video file.
  // Expected: the summary, the video sentence, then no video sentence after Dismiss.
  it("loads extended audio and dismisses a warning", async () => {
    const user = userEvent.setup();
    const { load } = renderPage();
    await screen.findByRole("button", { name: "Drop files here, or choose files" });
    load([
      audioFile("Streaming_History_Audio_2020.json"),
      new File(["[]"], "Streaming_History_Video_2020.json", { type: "application/json" }),
    ]);

    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText("1 video history file was skipped.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByText("1 video history file was skipped.")).not.toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(1));
  });

  // A zip of extended audio loads the same way a loose file does.
  // Input: a zip whose entry is one extended audio file.
  // Expected: the summary.
  it("loads a zip of extended audio", async () => {
    const { load } = renderPage();
    await screen.findByRole("button", { name: "Drop files here, or choose files" });
    const bytes = zipSync({
      "Spotify Extended Streaming History/Streaming_History_Audio_2020.json": strToU8(
        JSON.stringify([AUDIO_ROW]),
      ),
    });
    load([new File([bytes], "extended.zip", { type: "application/zip" })]);
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(1));
    expect(termValue("Files")).toBe(formatInt(1));
  });

  // Several loose audio files count as several source files.
  // Input: two extended audio files chosen together.
  // Expected: 2 streams and 2 files.
  it("loads multiple loose JSON files", async () => {
    const { load } = renderPage();
    await screen.findByRole("button", { name: "Drop files here, or choose files" });
    load([
      audioFile("Streaming_History_Audio_2019.json", [
        { ...AUDIO_ROW, spotify_track_uri: "spotify:track:one" },
      ]),
      audioFile("Streaming_History_Audio_2020.json", [
        { ...AUDIO_ROW, spotify_track_uri: "spotify:track:two" },
      ]),
    ]);
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(2));
    expect(termValue("Files")).toBe(formatInt(2));
  });

  // One extended audio file opens the hub.
  // Input: a single Streaming_History_Audio file.
  // Expected: the summary, with one stream and one file.
  it("loads one extended audio file", async () => {
    const { load } = renderPage();
    await screen.findByRole("button", { name: "Drop files here, or choose files" });
    load([audioFile()]);
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(1));
  });

  // A drop on the zone loads, the same as the picker.
  // Input: a DataTransfer dropped on the zone.
  // Expected: the summary.
  it("loads files dropped on the zone", async () => {
    renderWithProviders(<MainPage />);
    const zone = (
      await screen.findByRole("button", { name: "Drop files here, or choose files" })
    ).parentElement as HTMLElement;
    const file = audioFile();
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [file],
        items: [],
        dropEffect: "copy",
        types: ["Files"],
      },
    });
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(1));
  });

  // A failed replace keeps the dataset that was already on screen.
  // Input: a loaded dataset, then a past-year file through Replace data.
  // Expected: the empty-upload message and the original stream count.
  it("keeps the old summary when a replacement finds nothing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainPage />, { store: loadedStore(fixtureDataset()) });
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Choose JSON or zip files"),
      new File(["{}"], "StreamingHistory_music_0.json", { type: "application/json" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(REPLACE_EMPTY_MESSAGE);
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(termValue("Streams")).toBe(formatInt(2));
  });
});

/** The text of the summary value next to a label. */
function termValue(name: string): string {
  return screen.getByText(name).nextElementSibling?.textContent ?? "";
}

/**
 * Publishes loadFiles so a test can hand the page real files.
 * jsdom's file input does not keep Blob readers, so parsed uploads go through this.
 */
function LoadBridge({
  assign,
}: {
  assign: (load: (files: readonly File[]) => void) => void;
}) {
  const { loadFiles } = useDataset();
  assign(loadFiles);
  return null;
}

/** Renders the home page and returns a way to start a parse with real files. */
function renderPage(store?: ReturnType<typeof loadedStore>) {
  let loadFiles: (files: readonly File[]) => void = () => {};
  renderWithProviders(
    <>
      <LoadBridge
        assign={(load) => {
          loadFiles = load;
        }}
      />
      <MainPage />
    </>,
    store ? { store } : undefined,
  );
  return {
    load: (files: readonly File[]) => loadFiles(files),
  };
}

/** A store whose visit flag is set, so the session dataset loads. */
function loadedStore(dataset: Dataset) {
  const store = memoryDatasetStore({ schemaVersion: 1, durable: false, dataset });
  store.setVisitFlag();
  return store;
}

/** One extended-audio file. The row is long enough for the default threshold. */
function audioFile(
  name = "Streaming_History_Audio_2020.json",
  rows: readonly (typeof AUDIO_ROW)[] = [AUDIO_ROW],
): File {
  return new File([JSON.stringify(rows)], name, { type: "application/json" });
}

/**
 * Music and one podcast, across two files.
 * Two music plays pass 30 seconds, one does not. The podcast is a later date.
 */
function fixtureDataset(): Dataset {
  return {
    meta: {
      streamCount: 4,
      musicCount: 3,
      podcastCount: 1,
      ignoredVideoFiles: 0,
      minEndedAt: "2020-01-01T00:00:00.000Z",
      maxEndedAt: "2022-01-01T00:00:00.000Z",
      sourceFiles: ["Streaming_History_Audio_2019.json", "Streaming_History_Audio_2020.json"],
    },
    streams: [
      play({
        id: 0,
        endedAt: "2020-01-01T00:00:00.000Z",
        artist: "Ada",
        track: "One",
        msPlayed: 60_000,
        trackUri: "spotify:track:1",
      }),
      play({
        id: 1,
        endedAt: "2020-06-01T00:00:00.000Z",
        artist: "ada",
        track: "Two",
        msPlayed: 10_000,
        trackUri: "spotify:track:2",
      }),
      play({
        id: 2,
        endedAt: "2021-01-01T00:00:00.000Z",
        artist: "Bea",
        track: "Three",
        album: "Bea",
        msPlayed: 120_000,
        trackUri: null,
      }),
      play({
        id: 3,
        endedAt: "2022-01-01T00:00:00.000Z",
        artist: "Show",
        track: "Episode",
        msPlayed: 60_000,
        trackUri: null,
        isPodcast: true,
      }),
    ],
  };
}

/** A dataset whose only play is a podcast. */
function podcastDataset(): Dataset {
  return {
    meta: {
      streamCount: 1,
      musicCount: 0,
      podcastCount: 1,
      ignoredVideoFiles: 0,
      minEndedAt: "2020-01-01T00:00:00.000Z",
      maxEndedAt: "2020-01-01T00:00:00.000Z",
      sourceFiles: ["Streaming_History_Audio_2020.json"],
    },
    streams: [
      play({
        id: 0,
        artist: "Show",
        track: "Episode",
        isPodcast: true,
        msPlayed: 60_000,
      }),
    ],
  };
}

/** One play. Defaults are a music row. */
function play(overrides: Partial<Stream> & Pick<Stream, "id">): Stream {
  return {
    endedAt: "2020-01-01T00:00:00.000Z",
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
