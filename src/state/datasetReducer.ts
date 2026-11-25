/**
 * Status transitions for the dataset held in memory this visit.
 * A parse never clears a dataset that is already loaded. A failed replace
 * returns to ready and keeps that dataset. The startup read ends in ready
 * or empty, and is ignored once an upload has started.
 */

import type {
  Dataset,
  FileError,
  IngestResult,
  IngestWarning,
} from "@/data/types";
import { PARSE_FAILED_MESSAGE } from "@/data/ingest/workerMessages";

export type DatasetStatus = "empty" | "parsing" | "ready" | "error";

/** File progress. Present only while an upload is parsing, not during startup. */
export type ParseProgress = {
  done: number;
  total: number;
  /** Base name of the file that just finished. Null until the first report. */
  fileName: string | null;
};

export type DatasetState = {
  dataset: Dataset | null;
  status: DatasetStatus;
  /** A failed parse. Separate from storageError. */
  error: string | null;
  /** "3 files", or the single file name. Null when nothing is loaded. */
  sourceLabel: string | null;
  fileErrors: FileError[];
  warnings: IngestWarning[];
  /** A store that refused a write. A parse does not set this. */
  storageError: string | null;
  progress: ParseProgress | null;
  /** True until the visit read settles, unless an upload starts first. */
  awaitingStartup: boolean;
  /** True when the stored record for this dataset was saved on this browser. */
  durable: boolean;
  /** True while "Save on this browser" is writing. The dataset stays on screen. */
  saving: boolean;
  /** True after Clear, and only when the follow-up read finds no record. */
  nothingSaved: boolean;
  /** True after a refused write. Further writes this visit are skipped. */
  writesSkipped: boolean;
};

/** First paint. Parsing until the visit read in section 2.2 settles. */
export const initialDatasetState: DatasetState = {
  dataset: null,
  status: "parsing",
  error: null,
  sourceLabel: null,
  fileErrors: [],
  warnings: [],
  storageError: null,
  progress: null,
  awaitingStartup: true,
  durable: false,
  saving: false,
  nothingSaved: false,
  writesSkipped: false,
};

/** Shown when a new upload finds nothing and a dataset is already on screen. */
export const REPLACE_EMPTY_MESSAGE =
  "No streaming history was found in those files.";

/**
 * Shown when the visit read throws. Section 2.2 uses the same sentence
 * when a write is refused. It does not move the app to the error status.
 */
export const STORAGE_ERROR_MESSAGE =
  "This browser did not save the data. A refresh will not bring it back.";

/** Shown after Forget, only when the next read finds no record. */
export const NOTHING_SAVED_MESSAGE = "Nothing is saved in this browser.";

export type DatasetAction =
  | { type: "startup-empty" }
  | { type: "startup-failed" }
  | { type: "startup-ready"; dataset: Dataset; durable: boolean }
  | { type: "parse-start" }
  | { type: "parse-progress"; done: number; total: number; fileName: string }
  | { type: "parse-done"; result: IngestResult }
  | { type: "parse-failed" }
  | { type: "save-started" }
  | { type: "save-finished" }
  | { type: "save-idle" }
  | { type: "storage-failed"; keepDurable: boolean }
  | { type: "cleared"; nothingSaved: boolean };

/**
 * Short label for where the loaded dataset came from.
 * Input is the base names in meta.sourceFiles.
 * One file returns that name. Any other count returns "N files".
 */
export function sourceLabelFor(sourceFiles: readonly string[]): string {
  if (sourceFiles.length === 1) return sourceFiles[0];
  return `${sourceFiles.length} files`;
}

/**
 * Applies one status transition.
 * Input is the current visit state and one action from the provider.
 * Returns the next state. The input is not mutated.
 * A late action from a finished parse is ignored.
 */
export function datasetReducer(
  state: DatasetState,
  action: DatasetAction,
): DatasetState {
  switch (action.type) {
    case "startup-empty":
      if (!state.awaitingStartup) return state;
      return { ...state, status: "empty", awaitingStartup: false, progress: null };

    case "startup-failed":
      if (!state.awaitingStartup) return state;
      return {
        ...state,
        status: "empty",
        awaitingStartup: false,
        progress: null,
        storageError: STORAGE_ERROR_MESSAGE,
        writesSkipped: true,
      };

    case "startup-ready":
      if (!state.awaitingStartup) return state;
      return {
        ...applyDataset(state, action.dataset, [], []),
        durable: action.durable,
      };

    case "parse-start":
      return {
        ...state,
        status: "parsing",
        awaitingStartup: false,
        error: null,
        nothingSaved: false,
        progress: { done: 0, total: 0, fileName: null },
      };

    case "parse-progress":
      if (state.status !== "parsing" || state.awaitingStartup) return state;
      return {
        ...state,
        progress: {
          done: action.done,
          total: action.total,
          fileName: action.fileName,
        },
      };

    case "parse-done":
      if (state.status !== "parsing" || state.awaitingStartup) return state;
      return finishParse(state, action.result);

    case "parse-failed":
      if (state.status !== "parsing" || state.awaitingStartup) return state;
      return failParse(state, PARSE_FAILED_MESSAGE);

    case "save-started":
      if (state.status !== "ready" || !state.dataset || state.saving) return state;
      return { ...state, saving: true };

    case "save-finished":
      if (!state.dataset) return state;
      return { ...state, saving: false, durable: true };

    case "save-idle":
      return { ...state, saving: false };

    case "storage-failed":
      return {
        ...state,
        storageError: STORAGE_ERROR_MESSAGE,
        writesSkipped: true,
        saving: false,
        durable: action.keepDurable ? state.durable : false,
      };

    case "cleared":
      return {
        ...initialDatasetState,
        status: "empty",
        awaitingStartup: false,
        nothingSaved: action.nothingSaved,
      };
  }
}

/**
 * Stores a dataset and clears the parse error.
 * Input is the state, the dataset, and the ingest issues that came with it.
 * Startup passes an empty issue list. A successful upload passes its own.
 * Returns the ready state. storageError is left as it was.
 */
function applyDataset(
  state: DatasetState,
  dataset: Dataset,
  fileErrors: FileError[],
  warnings: IngestWarning[],
): DatasetState {
  return {
    ...state,
    status: "ready",
    dataset,
    sourceLabel: sourceLabelFor(dataset.meta.sourceFiles),
    fileErrors,
    warnings,
    error: null,
    progress: null,
    awaitingStartup: false,
  };
}

/**
 * Ends a parse that returned an ingest result.
 * Input is the parsing state and the result.
 * A dataset becomes ready. No dataset, and nothing loaded before, returns
 * to empty with the file errors kept for the upload screen. No dataset
 * during a replace stays ready and keeps the previous dataset.
 */
function finishParse(state: DatasetState, result: IngestResult): DatasetState {
  if (result.dataset) {
    return applyDataset(state, result.dataset, result.fileErrors, result.warnings);
  }
  if (state.dataset) {
    return {
      ...state,
      status: "ready",
      error: REPLACE_EMPTY_MESSAGE,
      fileErrors: result.fileErrors,
      warnings: result.warnings,
      progress: null,
    };
  }
  return {
    ...state,
    status: "empty",
    dataset: null,
    sourceLabel: null,
    error: null,
    fileErrors: result.fileErrors,
    warnings: result.warnings,
    progress: null,
    awaitingStartup: false,
  };
}

/**
 * Ends a parse that threw.
 * Input is the parsing state and the generic message.
 * A replace returns to ready with that message and the same dataset.
 * A first upload moves to error and leaves the dataset null.
 */
function failParse(state: DatasetState, message: string): DatasetState {
  if (state.dataset) {
    return {
      ...state,
      status: "ready",
      error: message,
      progress: null,
    };
  }
  return {
    ...state,
    status: "error",
    dataset: null,
    sourceLabel: null,
    error: message,
    progress: null,
    awaitingStartup: false,
  };
}
