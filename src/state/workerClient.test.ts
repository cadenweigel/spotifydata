/**
 * Tests for the worker client. A fake Worker checks the messages. The
 * fallback path checks that a thrown ingest does not leak its text.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestResult } from "@/data/types";
import { PARSE_FAILED_MESSAGE } from "@/data/ingest/workerMessages";
import type { ParseWorkerResponse } from "@/data/ingest/workerMessages";
import { startParse, type ParseHandlers } from "./workerClient";

const ingest = vi.hoisted(() => vi.fn());

vi.mock("@/data/ingest/ingest", () => ({
  ingest,
}));

class FakeWorker {
  static latest: FakeWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];

  constructor() {
    FakeWorker.latest = this;
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(data: ParseWorkerResponse) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  FakeWorker.latest = null;
});

describe("startParse", () => {
  // The worker receives the File objects and is closed after a result.
  // Input: one file, then a progress message and a done message.
  // Expected: the file is posted, progress is reported, and the worker is terminated.
  it("posts the files to a new worker and terminates it when done", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const file = new File(["[]"], "Streaming_History_Audio_2019.json");
    const handlers = recordingHandlers();
    const result = emptyResult();

    startParse([file], handlers);
    const worker = FakeWorker.latest;
    expect(worker).not.toBeNull();
    expect(worker?.posted).toEqual([{ files: [file] }]);

    worker?.emit({
      type: "progress",
      done: 1,
      total: 1,
      fileName: "Streaming_History_Audio_2019.json",
    });
    worker?.emit({ type: "done", result });

    expect(handlers.onProgress).toHaveBeenCalledWith({
      done: 1,
      total: 1,
      fileName: "Streaming_History_Audio_2019.json",
    });
    expect(handlers.onDone).toHaveBeenCalledWith(result);
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(worker?.terminated).toBe(true);
  });

  // The worker's own error text is dropped, even when it quotes a row.
  // Input: an error message that contains a sentinel string.
  // Expected: the callback receives only the generic message, and the worker is terminated.
  it("replaces a worker error with the generic message", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const handlers = recordingHandlers();
    startParse([], handlers);
    FakeWorker.latest?.emit({
      type: "error",
      message: "bad row SENTINEL_USER",
    });
    expect(handlers.onError).toHaveBeenCalledWith(PARSE_FAILED_MESSAGE);
    expect(handlers.onError.mock.calls[0]?.[0]).not.toContain("SENTINEL");
    expect(FakeWorker.latest?.terminated).toBe(true);
  });

  // A worker crash is the same generic failure.
  // Input: an error event whose message quotes a row.
  // Expected: the generic message, and no use of the event text.
  it("maps worker onerror to the generic message", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const handlers = recordingHandlers();
    startParse([], handlers);
    FakeWorker.latest?.onerror?.(
      new ErrorEvent("error", { message: "SENTINEL_ROW" }),
    );
    expect(handlers.onError).toHaveBeenCalledWith(PARSE_FAILED_MESSAGE);
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  // Cancel drops a result that arrives afterwards.
  // Input: cancel, then a done message.
  // Expected: no callback, and the worker is terminated.
  it("ignores a result after cancel", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const handlers = recordingHandlers();
    const session = startParse([], handlers);
    session.cancel();
    FakeWorker.latest?.emit({ type: "done", result: emptyResult() });
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(FakeWorker.latest?.terminated).toBe(true);
  });

  // No Worker means the main thread runs ingest.
  // Input: a constructor that throws, and an ingest rejection that quotes a row.
  // Expected: onError gets the generic message and not the thrown text.
  it("falls back to the main thread and hides the thrown text", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Worker unavailable");
        }
      },
    );
    ingest.mockRejectedValueOnce(new Error("bad row SENTINEL_ROW"));
    const handlers = recordingHandlers();

    startParse([new File(["{"], "broken.json")], handlers);

    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalled());
    expect(ingest).toHaveBeenCalledOnce();
    expect(handlers.onError).toHaveBeenCalledWith(PARSE_FAILED_MESSAGE);
    expect(handlers.onError.mock.calls[0]?.[0]).not.toContain("SENTINEL");
    expect(handlers.onDone).not.toHaveBeenCalled();
  });
});

/** Callbacks as mocks, so a test can assert what the client delivered. */
function recordingHandlers(): ParseHandlers & {
  onProgress: ReturnType<typeof vi.fn>;
  onDone: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
} {
  return {
    onProgress: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

/** A result with nothing in it, used when the payload itself is not under test. */
function emptyResult(): IngestResult {
  return { dataset: null, fileErrors: [], warnings: [] };
}
