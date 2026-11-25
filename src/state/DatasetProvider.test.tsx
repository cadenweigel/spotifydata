/**
 * Tests for the provider wiring. The reducer tests cover each transition.
 * These check startup, the worker session, and that a failed replace
 * still leaves the previous dataset on screen.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "@/data/types";
import { PARSE_FAILED_MESSAGE } from "@/data/ingest/workerMessages";
import type { ParseWorkerResponse } from "@/data/ingest/workerMessages";
import { STORAGE_ERROR_MESSAGE } from "./datasetReducer";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import { DatasetProvider } from "./DatasetProvider";
import { useDataset } from "./useDataset";

class FakeWorker {
  static latest: FakeWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;

  constructor() {
    FakeWorker.latest = this;
  }

  postMessage() {}

  terminate() {
    this.terminated = true;
  }

  emit(data: ParseWorkerResponse) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.latest = null;
});

describe("DatasetProvider", () => {
  // The visit read finishes on the empty screen, and the stream list is empty.
  // Input: the default provider, which has nothing saved.
  // Expected: status empty, isReady false, and a stable empty stream list.
  it("finishes startup with no dataset", async () => {
    render(
      <DatasetProvider store={memoryDatasetStore()}>
        <StatusProbe />
      </DatasetProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("empty");
    });
    expect(screen.getByTestId("ready")).toHaveTextContent("no");
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  // A saved dataset is exposed through the same fields an upload would set.
  // Input: a durable record already in the store.
  // Expected: ready, that file name, and the stored stream list.
  it("exposes a dataset returned by the visit read", async () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json");
    render(
      <DatasetProvider
        store={memoryDatasetStore({ schemaVersion: 1, durable: true, dataset })}
      >
        <StatusProbe />
      </DatasetProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("ready");
    });
    expect(screen.getByTestId("ready")).toHaveTextContent("yes");
    expect(screen.getByTestId("label")).toHaveTextContent(
      "Streaming_History_Audio_2019.json",
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("track")).toHaveTextContent("Song");
  });

  // Replacing data and then failing the new parse must not drop the old rows.
  // Input: a successful worker result, then a second parse that posts an error.
  // Expected: status returns to ready, the first track is still shown, and the first worker was closed.
  it("keeps the loaded dataset when a later upload fails", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const user = userEvent.setup();
    render(
      <DatasetProvider store={memoryDatasetStore()}>
        <UploadProbe />
      </DatasetProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("empty");
    });

    await user.click(screen.getByRole("button", { name: "Upload" }));
    const first = FakeWorker.latest;
    await act(async () => {
      first?.emit({
        type: "done",
        result: {
          dataset: makeDataset("Streaming_History_Audio_2019.json"),
          fileErrors: [],
          warnings: [],
        },
      });
    });
    expect(screen.getByTestId("track")).toHaveTextContent("Song");
    expect(first?.terminated).toBe(true);

    await user.click(screen.getByRole("button", { name: "Upload" }));
    const second = FakeWorker.latest;
    expect(second).not.toBe(first);
    await act(async () => {
      second?.emit({ type: "error", message: "SENTINEL_ROW" });
    });

    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("track")).toHaveTextContent("Song");
    expect(screen.getByTestId("error")).toHaveTextContent(PARSE_FAILED_MESSAGE);
    expect(screen.getByTestId("error").textContent).not.toContain("SENTINEL");
  });

  // Leaving the tree closes the worker that is still parsing.
  // Input: an upload that has not posted a result yet, then unmount.
  // Expected: that worker is terminated.
  it("terminates the worker when the provider unmounts", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const user = userEvent.setup();
    const view = render(
      <DatasetProvider store={memoryDatasetStore()}>
        <UploadProbe />
      </DatasetProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("empty");
    });
    await user.click(screen.getByRole("button", { name: "Upload" }));
    const worker = FakeWorker.latest;
    view.unmount();
    expect(worker?.terminated).toBe(true);
  });

  // A refused write keeps the dataset that just parsed.
  // Input: a store whose put throws, then one successful worker result.
  // Expected: status stays ready, the track is still shown, and the storage sentence is set.
  it("keeps the parsed dataset when the store rejects the write", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const user = userEvent.setup();
    const store = memoryDatasetStore();
    store.failPuts();
    render(
      <DatasetProvider store={store}>
        <UploadProbe />
      </DatasetProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("empty");
    });
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await act(async () => {
      FakeWorker.latest?.emit({
        type: "done",
        result: {
          dataset: makeDataset("Streaming_History_Audio_2019.json"),
          fileErrors: [],
          warnings: [],
        },
      });
    });
    expect(screen.getByTestId("track")).toHaveTextContent("Song");
    await waitFor(() => {
      expect(screen.getByTestId("storage")).toHaveTextContent(STORAGE_ERROR_MESSAGE);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("track")).toHaveTextContent("Song");
  });
});

/** Reads the fields pages use, so the test can see startup finish. */
function StatusProbe() {
  const { status, isReady, sourceLabel, filteredStreams } = useDataset();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="ready">{isReady ? "yes" : "no"}</p>
      <p data-testid="label">{sourceLabel ?? ""}</p>
      <p data-testid="count">{filteredStreams.length}</p>
      <p data-testid="track">{filteredStreams[0]?.track ?? ""}</p>
    </div>
  );
}

/** Starts an upload with one empty file. The worker fake supplies the result. */
function UploadProbe() {
  const { status, error, storageError, filteredStreams, loadFiles } = useDataset();
  const [file] = useState(() => new File(["[]"], "notes.json"));
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="error">{error ?? ""}</p>
      <p data-testid="storage">{storageError ?? ""}</p>
      <p data-testid="track">{filteredStreams[0]?.track ?? ""}</p>
      <button type="button" onClick={() => loadFiles([file])}>
        Upload
      </button>
    </div>
  );
}

/** A one-stream dataset named by the given source files. */
function makeDataset(sourceFile: string): Dataset {
  return {
    meta: {
      streamCount: 1,
      musicCount: 1,
      podcastCount: 0,
      ignoredVideoFiles: 0,
      minEndedAt: "2020-01-01T00:00:00.000Z",
      maxEndedAt: "2020-01-01T00:00:00.000Z",
      sourceFiles: [sourceFile],
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
