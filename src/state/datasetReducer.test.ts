/**
 * Tests for the dataset status transitions. Each one starts from the
 * initial parsing state or from a loaded dataset and checks the next state.
 */

import { describe, expect, it } from "vitest";
import type { Dataset, FileError, IngestResult, IngestWarning } from "@/data/types";
import { PARSE_FAILED_MESSAGE } from "@/data/ingest/workerMessages";
import {
  datasetReducer,
  initialDatasetState,
  NOTHING_SAVED_MESSAGE,
  REPLACE_EMPTY_MESSAGE,
  STORAGE_ERROR_MESSAGE,
  type DatasetState,
} from "./datasetReducer";

const fileError: FileError = { fileName: "notes.json", message: "Expected a list of streams." };
const warning: IngestWarning = { kind: "ignoredOtherFiles", count: 1 };

describe("datasetReducer", () => {
  // The first paint waits for the visit read.
  // Input: the initial state, before any action.
  // Expected: status is parsing, there is no dataset, and progress is empty.
  it("starts parsing with no dataset", () => {
    expect(initialDatasetState.status).toBe("parsing");
    expect(initialDatasetState.dataset).toBeNull();
    expect(initialDatasetState.progress).toBeNull();
    expect(initialDatasetState.awaitingStartup).toBe(true);
  });

  // A visit with nothing stored ends on the empty screen.
  // Input: the initial state, then startup-empty.
  // Expected: status is empty and startup will not run again.
  it("ends startup on empty when nothing is stored", () => {
    const state = datasetReducer(initialDatasetState, { type: "startup-empty" });
    expect(state.status).toBe("empty");
    expect(state.dataset).toBeNull();
    expect(state.awaitingStartup).toBe(false);
    expect(state.storageError).toBeNull();
  });

  // A thrown visit read stays empty and records the storage message.
  // Input: the initial state, then startup-failed.
  // Expected: status is empty, not error, and storageError is the fixed sentence.
  it("keeps a thrown startup read off the error status", () => {
    const state = datasetReducer(initialDatasetState, { type: "startup-failed" });
    expect(state.status).toBe("empty");
    expect(state.error).toBeNull();
    expect(state.storageError).toBe(STORAGE_ERROR_MESSAGE);
    expect(state.writesSkipped).toBe(true);
  });

  // A stored dataset uses the same ready path as an upload.
  // Input: one saved dataset with a single source file.
  // Expected: ready, that dataset, and the file name as the label.
  it("loads a saved dataset as ready", () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json");
    const state = datasetReducer(initialDatasetState, {
      type: "startup-ready",
      dataset,
      durable: true,
    });
    expect(state.status).toBe("ready");
    expect(state.dataset).toBe(dataset);
    expect(state.durable).toBe(true);
    expect(state.sourceLabel).toBe("Streaming_History_Audio_2019.json");
    expect(state.fileErrors).toEqual([]);
    expect(state.warnings).toEqual([]);
    expect(state.error).toBeNull();
  });

  // An upload that starts during startup is not wiped when the read finishes.
  // Input: parse-start, then a late startup-empty.
  // Expected: still parsing, with file progress set.
  it("ignores a late startup result after an upload starts", () => {
    const parsing = datasetReducer(initialDatasetState, { type: "parse-start" });
    const state = datasetReducer(parsing, { type: "startup-empty" });
    expect(state.status).toBe("parsing");
    expect(state.awaitingStartup).toBe(false);
    expect(state.progress).toEqual({ done: 0, total: 0, fileName: null });
  });

  // empty → parsing → ready, including the source label for several files.
  // Input: an empty visit, a start, a progress report, then a two-file result.
  // Expected: ready, the new dataset, the label "2 files", and no progress.
  it("moves from empty through parsing to ready", () => {
    const empty = datasetReducer(initialDatasetState, { type: "startup-empty" });
    const parsing = datasetReducer(empty, { type: "parse-start" });
    const reported = datasetReducer(parsing, {
      type: "parse-progress",
      done: 1,
      total: 2,
      fileName: "Streaming_History_Audio_2019.json",
    });
    const dataset = makeDataset(
      "Streaming_History_Audio_2019.json",
      "Streaming_History_Audio_2020.json",
    );
    const ready = datasetReducer(reported, {
      type: "parse-done",
      result: result(dataset, [fileError], [warning]),
    });

    expect(parsing.status).toBe("parsing");
    expect(reported.progress).toEqual({
      done: 1,
      total: 2,
      fileName: "Streaming_History_Audio_2019.json",
    });
    expect(ready.status).toBe("ready");
    expect(ready.dataset).toBe(dataset);
    expect(ready.sourceLabel).toBe("2 files");
    expect(ready.fileErrors).toEqual([fileError]);
    expect(ready.warnings).toEqual([warning]);
    expect(ready.error).toBeNull();
    expect(ready.progress).toBeNull();
  });

  // A first upload that throws lands on error and keeps no dataset.
  // Input: empty, then parse-start, then parse-failed.
  // Expected: status error and the generic message.
  it("moves from empty through parsing to error", () => {
    const empty = datasetReducer(initialDatasetState, { type: "startup-empty" });
    const failed = datasetReducer(datasetReducer(empty, { type: "parse-start" }), {
      type: "parse-failed",
    });
    expect(failed.status).toBe("error");
    expect(failed.dataset).toBeNull();
    expect(failed.error).toBe(PARSE_FAILED_MESSAGE);
    expect(failed.progress).toBeNull();
  });

  // Files that parse but contain no streams stay on the empty screen.
  // Input: a result whose dataset is null, from an empty visit.
  // Expected: status empty, error null, and the file errors kept.
  it("returns to empty when the first upload has no streams", () => {
    const empty = datasetReducer(initialDatasetState, { type: "startup-empty" });
    const state = datasetReducer(datasetReducer(empty, { type: "parse-start" }), {
      type: "parse-done",
      result: result(null, [fileError], [warning]),
    });
    expect(state.status).toBe("empty");
    expect(state.dataset).toBeNull();
    expect(state.error).toBeNull();
    expect(state.fileErrors).toEqual([fileError]);
    expect(state.warnings).toEqual([warning]);
  });

  // error → parsing clears the banner, and a later success reaches ready.
  // Input: a failed first upload, a retry, then a dataset.
  // Expected: parsing with no error, then ready with the dataset.
  it("allows a retry after an error", () => {
    const failed = datasetReducer(
      datasetReducer(initialDatasetState, { type: "parse-start" }),
      { type: "parse-failed" },
    );
    const parsing = datasetReducer(failed, { type: "parse-start" });
    const dataset = makeDataset("Streaming_History_Audio_2019.json");
    const ready = datasetReducer(parsing, {
      type: "parse-done",
      result: result(dataset),
    });
    expect(failed.status).toBe("error");
    expect(parsing.status).toBe("parsing");
    expect(parsing.error).toBeNull();
    expect(ready.status).toBe("ready");
    expect(ready.dataset).toBe(dataset);
  });

  // A failed replace keeps the loaded dataset and returns to ready.
  // Input: a ready dataset, a new parse, then a thrown failure.
  // Expected: the same dataset, status ready, and the generic error.
  it("keeps the old dataset when a replace throws", () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json");
    const ready = loaded(dataset, [fileError], [warning]);
    const parsing = datasetReducer(ready, { type: "parse-start" });
    const failed = datasetReducer(parsing, { type: "parse-failed" });

    expect(parsing.dataset).toBe(dataset);
    expect(parsing.error).toBeNull();
    expect(failed.status).toBe("ready");
    expect(failed.dataset).toBe(dataset);
    expect(failed.sourceLabel).toBe("Streaming_History_Audio_2019.json");
    expect(failed.error).toBe(PARSE_FAILED_MESSAGE);
    expect(failed.fileErrors).toEqual([fileError]);
    expect(failed.warnings).toEqual([warning]);
    expect(failed.progress).toBeNull();
  });

  // A replace that finds nothing is also a failure. The old rows stay.
  // Input: a ready dataset, then a result with a null dataset.
  // Expected: the same dataset, the new file errors, and the empty-upload message.
  it("keeps the old dataset when a replace finds no streams", () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json");
    const ready = loaded(dataset);
    const failed = datasetReducer(datasetReducer(ready, { type: "parse-start" }), {
      type: "parse-done",
      result: result(null, [fileError], []),
    });
    expect(failed.status).toBe("ready");
    expect(failed.dataset).toBe(dataset);
    expect(failed.error).toBe(REPLACE_EMPTY_MESSAGE);
    expect(failed.fileErrors).toEqual([fileError]);
  });

  // A successful replace swaps the dataset and clears a previous error.
  // Input: a ready dataset that already has an error banner, then a new result.
  // Expected: the new dataset, no error, and the new label.
  it("replaces the dataset when the new upload succeeds", () => {
    const original = makeDataset("Streaming_History_Audio_2019.json");
    const next = makeDataset(
      "endsong_0.json",
      "endsong_1.json",
      "endsong_2.json",
    );
    const ready = {
      ...loaded(original),
      error: PARSE_FAILED_MESSAGE,
    };
    const replaced = datasetReducer(datasetReducer(ready, { type: "parse-start" }), {
      type: "parse-done",
      result: result(next),
    });
    expect(replaced.status).toBe("ready");
    expect(replaced.dataset).toBe(next);
    expect(replaced.sourceLabel).toBe("3 files");
    expect(replaced.error).toBeNull();
  });

  // Progress only exists while a file parse is running.
  // Input: a progress action after the parse has already finished.
  // Expected: the ready state is unchanged.
  it("ignores progress once the parse has finished", () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json");
    const ready = loaded(dataset);
    const state = datasetReducer(ready, {
      type: "parse-progress",
      done: 1,
      total: 1,
      fileName: "Streaming_History_Audio_2019.json",
    });
    expect(state).toBe(ready);
  });

  // A refused write keeps the dataset and records the storage sentence.
  // Input: a ready dataset, then storage-failed.
  // Expected: the same dataset, status ready, and further writes skipped.
  it("keeps the dataset when a write is refused", () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json");
    const ready = { ...loaded(dataset), durable: true };
    const kept = datasetReducer(ready, { type: "storage-failed", keepDurable: true });
    const dropped = datasetReducer(ready, { type: "storage-failed", keepDurable: false });
    expect(kept.status).toBe("ready");
    expect(kept.dataset).toBe(dataset);
    expect(kept.durable).toBe(true);
    expect(kept.storageError).toBe(STORAGE_ERROR_MESSAGE);
    expect(kept.error).toBeNull();
    expect(kept.writesSkipped).toBe(true);
    expect(dropped.dataset).toBe(dataset);
    expect(dropped.durable).toBe(false);
  });

  // Clear drops the in-memory dataset. The sentence is a separate flag.
  // Input: a ready dataset, then cleared with nothingSaved.
  // Expected: empty, no dataset, and the flag the home page reads.
  it("drops the dataset when the visit is cleared", () => {
    const ready = loaded(makeDataset("Streaming_History_Audio_2019.json"));
    const cleared = datasetReducer(ready, { type: "cleared", nothingSaved: true });
    expect(cleared.status).toBe("empty");
    expect(cleared.dataset).toBeNull();
    expect(cleared.nothingSaved).toBe(true);
    expect(NOTHING_SAVED_MESSAGE).toBe("Nothing is saved in this browser.");
  });
});

/** A ready state holding one dataset, built through the startup path. */
function loaded(
  dataset: Dataset,
  fileErrors: FileError[] = [],
  warnings: IngestWarning[] = [],
): DatasetState {
  return {
    ...datasetReducer(initialDatasetState, {
      type: "startup-ready",
      dataset,
      durable: false,
    }),
    fileErrors,
    warnings,
  };
}

/** An ingest result. A null dataset means nothing usable was found. */
function result(
  dataset: Dataset | null,
  fileErrors: FileError[] = [],
  warnings: IngestWarning[] = [],
): IngestResult {
  return { dataset, fileErrors, warnings };
}

/** A one-stream dataset named by the given source files. */
function makeDataset(...sourceFiles: string[]): Dataset {
  return {
    meta: {
      streamCount: 1,
      musicCount: 1,
      podcastCount: 0,
      ignoredVideoFiles: 0,
      minEndedAt: "2020-01-01T00:00:00.000Z",
      maxEndedAt: "2020-01-01T00:00:00.000Z",
      sourceFiles,
    },
    streams: [
      {
        id: 0,
        endedAt: "2020-01-01T00:00:00.000Z",
        msPlayed: 30_000,
        artist: "Artist",
        album: "Album",
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
