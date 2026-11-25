/**
 * Runs one upload in a worker and maps its messages onto callbacks.
 * The provider owns when a parse starts. This file is the only place
 * that constructs a Worker. If that constructor throws, ingest runs on
 * the main thread so the upload still finishes.
 */

import { ingest } from "@/data/ingest/ingest";
import type { IngestResult } from "@/data/types";
import {
  PARSE_FAILED_MESSAGE,
  type ParseWorkerRequest,
  type ParseWorkerResponse,
} from "@/data/ingest/workerMessages";
export type ParseHandlers = {
  onProgress: (progress: {
    done: number;
    total: number;
    fileName: string;
  }) => void;
  onDone: (result: IngestResult) => void;
  onError: (message: string) => void;
};

export type ParseSession = {
  /** Stops delivering results and terminates the worker when one exists. */
  cancel: () => void;
};

/**
 * Parses files off the main thread.
 * Input is the upload and the callbacks for progress, success, and failure.
 * Returns a session whose cancel drops later messages.
 * The worker is a new one each call, and it is terminated when the parse ends.
 */
export function startParse(
  files: readonly File[],
  handlers: ParseHandlers,
): ParseSession {
  try {
    const worker = new Worker(
      new URL("../data/ingest/parse.worker.ts", import.meta.url),
      { type: "module" },
    );
    return listen(worker, files, handlers);
  } catch {
    return startOnMainThread(files, handlers);
  }
}

/**
 * Subscribes to one worker and sends it the files.
 * Input is a freshly constructed worker, the files, and the callbacks.
 * File bytes are cloned into the worker. They are not read here.
 * Returns the session that terminates that worker.
 */
function listen(
  worker: Worker,
  files: readonly File[],
  handlers: ParseHandlers,
): ParseSession {
  let settled = false;

  const fail = () => {
    if (settled) return;
    settled = true;
    handlers.onError(PARSE_FAILED_MESSAGE);
    worker.terminate();
  };

  worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
    const message = event.data;
    if (!message || typeof message !== "object" || !("type" in message)) {
      fail();
      return;
    }
    switch (message.type) {
      case "progress":
        if (settled) return;
        handlers.onProgress({
          done: message.done,
          total: message.total,
          fileName: message.fileName,
        });
        return;
      case "done":
        if (settled) return;
        settled = true;
        handlers.onDone(message.result);
        worker.terminate();
        return;
      case "error":
        fail();
        return;
      default:
        fail();
    }
  };

  worker.onerror = (event) => {
    event.preventDefault();
    fail();
  };

  worker.onmessageerror = () => {
    fail();
  };

  try {
    const request: ParseWorkerRequest = { files: Array.from(files) };
    worker.postMessage(request);
  } catch {
    fail();
  }

  return {
    cancel() {
      if (settled) return;
      settled = true;
      worker.terminate();
    },
  };
}

/**
 * Parses on the main thread when no worker can be created.
 * Input is the same file list and callbacks as startParse.
 * A thrown ingest becomes the generic failure message.
 * Returns a session whose cancel ignores the result if it arrives later.
 */
function startOnMainThread(
  files: readonly File[],
  handlers: ParseHandlers,
): ParseSession {
  let settled = false;

  void ingest(files, (progress) => {
    if (settled) return;
    handlers.onProgress({
      done: progress.done,
      total: progress.total,
      fileName: progress.fileName,
    });
  }).then(
    (result) => {
      if (settled) return;
      settled = true;
      handlers.onDone(result);
    },
    () => {
      if (settled) return;
      settled = true;
      handlers.onError(PARSE_FAILED_MESSAGE);
    },
  );

  return {
    cancel() {
      settled = true;
    },
  };
}
