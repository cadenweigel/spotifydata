/**
 * Tests for saving and clearing through an in-memory store.
 * A thrown put is a fake quota error. No IndexedDB package is involved.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";
import type { Dataset } from "@/data/types";
import { ingest } from "@/data/ingest/ingest";
import { decideRestore } from "./decideRestore";
import { clearVisit, loadVisit, storeDataset } from "./persistVisit";

const SENTINEL_USER = "SENTINEL_USER";
const SENTINEL_IP = "SENTINEL_IP";
const SENTINEL_UA = "SENTINEL_UA";

beforeAll(() => {
  installBlobReaders();
});

describe("persistVisit", () => {
  // A record written and read back is the same dataset.
  // Input: one dataset stored with durable false.
  // Expected: the next read returns that record, including the flag.
  it("round-trips a record through get, put, and delete", async () => {
    const store = memoryDatasetStore();
    const dataset = makeDataset("Streaming_History_Audio_2019.json", "Song");
    expect(await storeDataset(store, dataset, false)).toBe("stored");
    expect(store.read()?.dataset.streams[0]?.track).toBe("Song");
    expect(store.readVisitFlag()).toBe(true);

    await store.deleteDataset();
    expect(await store.getDataset()).toBeNull();
  });

  // The stored JSON is the stripped stream, not the Spotify row.
  // Input: one extended row whose username, IP, and user agent are sentinels.
  // Expected: the stored text contains none of those strings.
  it("stores none of the sentinel username, IP, or user agent", async () => {
    const result = await ingest([
      new File(
        [
          JSON.stringify([
            {
              ts: "2020-01-01T00:00:00Z",
              ms_played: 40_000,
              master_metadata_track_name: "Song",
              master_metadata_album_artist_name: "Artist",
              username: SENTINEL_USER,
              ip_addr: SENTINEL_IP,
              user_agent_decrypted: SENTINEL_UA,
            },
          ]),
        ],
        "Streaming_History_Audio_2019.json",
      ),
    ]);
    const dataset = result.dataset;
    expect(dataset).not.toBeNull();
    const store = memoryDatasetStore();
    await storeDataset(store, dataset as Dataset, false);
    const stored = JSON.stringify(store.read());
    expect(stored).not.toContain(SENTINEL_USER);
    expect(stored).not.toContain(SENTINEL_IP);
    expect(stored).not.toContain(SENTINEL_UA);
  });

  // Save turns the record durable, so a later visit with no flag still loads.
  // Input: a session record, then a write with durable true, then the flag cleared.
  // Expected: decideRestore returns load.
  it("loads a saved record when the visit flag is missing", async () => {
    const store = memoryDatasetStore();
    const dataset = makeDataset("Streaming_History_Audio_2019.json", "Song");
    await storeDataset(store, dataset, false);
    await storeDataset(store, dataset, true);
    store.clearVisitFlag();
    expect(
      decideRestore({
        record: store.read(),
        visitFlag: false,
        otherTabOwnsVisit: false,
      }),
    ).toBe("load");
    expect(store.read()?.durable).toBe(true);
  });

  // A later upload keeps durable and replaces the streams.
  // Input: a durable record, then a second dataset written with durable still true.
  // Expected: the new track is what a read returns, and durable is still true.
  it("keeps durable true when a later upload replaces the streams", async () => {
    const store = memoryDatasetStore();
    await storeDataset(store, makeDataset("old.json", "Old"), true);
    await storeDataset(store, makeDataset("new.json", "New"), true);
    expect(store.read()?.durable).toBe(true);
    expect(store.read()?.dataset.streams[0]?.track).toBe("New");
    expect(store.read()?.dataset.meta.sourceFiles).toEqual(["new.json"]);
  });

  // Clear removes the record and does not touch a prefs object.
  // Input: a stored dataset and a separate prefs object.
  // Expected: the next read is empty, and prefs is unchanged.
  it("clears the record and leaves prefs alone", async () => {
    const store = memoryDatasetStore();
    const prefs = { version: 1, streamThresholdMs: 30_000, includePodcasts: false };
    const before = { ...prefs };
    await storeDataset(store, makeDataset("Streaming_History_Audio_2019.json", "Song"), true);
    const cleared = await clearVisit(store);
    expect(cleared).toEqual({ ok: true, nothingSaved: true, readFailed: false });
    expect(await store.getDataset()).toBeNull();
    expect(store.readVisitFlag()).toBe(false);
    expect(prefs).toEqual(before);
  });

  // A thrown put does not change the record that was already stored.
  // Input: one stored dataset, then a put that throws.
  // Expected: "failed", and the original track is still what a read returns.
  it("leaves the stored record in place when a write throws", async () => {
    const store = memoryDatasetStore();
    await storeDataset(store, makeDataset("old.json", "Old"), false);
    store.failPuts();
    const outcome = await storeDataset(store, makeDataset("new.json", "New"), true);
    expect(outcome).toBe("failed");
    expect(store.read()?.dataset.streams[0]?.track).toBe("Old");
    expect(store.read()?.durable).toBe(false);
  });

  // A non-durable record with no flag and no other tab is deleted on load.
  // Input: a session record, no flag, no other tab.
  // Expected: loadVisit returns empty and the record is gone.
  it("deletes a leftover session record on startup", async () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json", "Song");
    const store = memoryDatasetStore({ schemaVersion: 1, durable: false, dataset });
    const outcome = await loadVisit(store);
    expect(outcome).toEqual({ type: "empty" });
    expect(store.read()).toBeNull();
  });

  // Another tab's session record is left in the store and not shown here.
  // Input: a session record, and the other-tab check answers yes.
  // Expected: empty, and the record is still stored.
  it("does not delete a session record another tab owns", async () => {
    const dataset = makeDataset("Streaming_History_Audio_2019.json", "Song");
    const store = memoryDatasetStore({ schemaVersion: 1, durable: false, dataset });
    store.setOtherTab(true);
    const outcome = await loadVisit(store);
    expect(outcome).toEqual({ type: "empty" });
    expect(store.read()?.dataset.streams[0]?.track).toBe("Song");
  });
});

/** A one-stream dataset named by the file and the track. */
function makeDataset(sourceFile: string, track: string): Dataset {
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
        track,
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

/**
 * This jsdom build's Blob has no text() or arrayBuffer(). Browsers do.
 * FileReader is the fallback those methods are specified in terms of.
 */
function installBlobReaders(): void {
  const blobPrototype = Blob.prototype as Blob & {
    text?: () => Promise<string>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof blobPrototype.text !== "function") {
    blobPrototype.text = function text(this: Blob) {
      return readBlob(this, "text") as Promise<string>;
    };
  }
  if (typeof blobPrototype.arrayBuffer !== "function") {
    blobPrototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return readBlob(this, "arrayBuffer") as Promise<ArrayBuffer>;
    };
  }
}

function readBlob(blob: Blob, mode: "text" | "arrayBuffer"): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result == null) reject(new Error("empty read"));
      else resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    if (mode === "text") reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });
}
