/**
 * Messages between the parse worker and the main thread.
 * The worker posts progress, then either the full ingest result or a
 * generic failure. Row contents never travel in an error message.
 * The main thread sends the files and does not read them first.
 */

import type { IngestResult } from "@/data/types";

/** Shown when parsing throws. Never includes a row or a file's contents. */
export const PARSE_FAILED_MESSAGE = "The files could not be read.";

/** Main thread → worker. Files are structured-cloned into the worker. */
export type ParseWorkerRequest = {
  files: File[];
};

/** Worker → main thread. `done` carries the whole ingest result. */
export type ParseWorkerResponse =
  | { type: "progress"; done: number; total: number; fileName: string }
  | { type: "done"; result: IngestResult }
  | { type: "error"; message: string };
