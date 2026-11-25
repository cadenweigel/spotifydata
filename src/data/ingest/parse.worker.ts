/**
 * Parses one upload off the main thread.
 * It imports ingest.ts, the same path the tests use, and posts only the
 * stripped result. Spotify rows, usernames, and IP addresses stay in this
 * worker and are never posted back.
 */

import { ingest } from "./ingest";
import {
  PARSE_FAILED_MESSAGE,
  type ParseWorkerRequest,
  type ParseWorkerResponse,
} from "./workerMessages";

/** The slice of the worker global this file uses. */
type WorkerScope = {
  onmessage: ((event: MessageEvent<ParseWorkerRequest>) => void) | null;
  postMessage(message: ParseWorkerResponse): void;
};

const scope = globalThis as unknown as WorkerScope;

let started = false;

scope.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  if (started) return;
  started = true;
  const files = event.data?.files;
  if (!Array.isArray(files)) {
    post({ type: "error", message: PARSE_FAILED_MESSAGE });
    return;
  }
  void run(files);
};

/**
 * Reads and normalizes the upload, then posts the result.
 * Input is the cloned File list from the main thread.
 * A thrown parse posts a fixed message and drops the exception text,
 * because that text can quote the file.
 */
async function run(files: File[]): Promise<void> {
  try {
    const result = await ingest(files, (progress) => {
      post({
        type: "progress",
        done: progress.done,
        total: progress.total,
        fileName: progress.fileName,
      });
    });
    post({ type: "done", result });
  } catch {
    post({ type: "error", message: PARSE_FAILED_MESSAGE });
  }
}

/** Posts one worker message. The payload is the stripped ingest result or a count. */
function post(message: ParseWorkerResponse): void {
  scope.postMessage(message);
}
