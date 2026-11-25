/**
 * The one stored dataset, the visit flag, and the other-tab check.
 * IndexedDB holds the streams. sessionStorage holds only a flag that
 * this tab's visit is still going. No other file reads or writes those,
 * or the visit BroadcastChannel.
 */

import type { Dataset, DatasetMeta } from "@/data/types";

const DB_NAME = "spotifydata";
const STORE_NAME = "dataset";
const RECORD_KEY = "current";
const VISIT_KEY = "spotifydata-visit";
const VISIT_CHANNEL = "spotifydata-visit";
const VISIT_ANSWER_MS = 300;

export type StoredDataset = {
  schemaVersion: 1;
  /** True after "Save on this browser". A later upload keeps this value. */
  durable: boolean;
  /** Stripped dataset. Warnings and file errors are not stored. */
  dataset: Dataset;
};

/** What a raw IndexedDB value means. A bad shape is deleted by the caller. */
export type StoredRead = {
  record: StoredDataset | null;
  deleteRecord: boolean;
};

export type DatasetStore = {
  getDataset(): Promise<StoredDataset | null>;
  putDataset(record: StoredDataset): Promise<void>;
  deleteDataset(): Promise<void>;
  readVisitFlag(): boolean;
  setVisitFlag(): void;
  clearVisitFlag(): void;
  /** True when another tab answers within 300 ms. Missing channel means false. */
  otherTabOwnsVisit(): Promise<boolean>;
  /** Starts answering other tabs. Safe to call more than once. */
  listenForVisit(): void;
};

/**
 * Reads one stored value.
 * Input is whatever IndexedDB returned. Null and undefined mean no record.
 * A schema other than 1, or a value that is not a dataset, asks to be deleted.
 * Returns the record to use, or null, plus whether the caller should delete it.
 */
export function readStoredValue(raw: unknown): StoredRead {
  if (raw == null) return { record: null, deleteRecord: false };
  const record = acceptStoredDataset(raw);
  if (!record) return { record: null, deleteRecord: true };
  return { record, deleteRecord: false };
}

/**
 * Checks the saved record shape.
 * Input is an unknown value from the database.
 * Returns the record when schemaVersion is 1 and the dataset shape holds.
 * Returns null for anything else. It does not throw.
 */
export function acceptStoredDataset(value: unknown): StoredDataset | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== 1) return null;
  if (typeof value.durable !== "boolean") return null;
  if (!isDataset(value.dataset)) return null;
  return {
    schemaVersion: 1,
    durable: value.durable,
    dataset: value.dataset,
  };
}

/**
 * Reads the one record.
 * Opens the database, then returns the stored dataset.
 * A bad shape is deleted and treated as missing.
 * Throws when the database cannot be opened. The caller keeps that off the error status.
 */
export async function getDataset(): Promise<StoredDataset | null> {
  const db = await openDatabase();
  try {
    const raw = await requestResult(db, "readonly", (store) => store.get(RECORD_KEY));
    const read = readStoredValue(raw);
    if (read.deleteRecord) {
      await requestResult(db, "readwrite", (store) => store.delete(RECORD_KEY));
      return null;
    }
    return read.record;
  } finally {
    db.close();
  }
}

/**
 * Writes the one record, replacing whatever was there.
 * Input is the record to store. Throws when the write is refused, including a full quota.
 */
export async function putDataset(record: StoredDataset): Promise<void> {
  const db = await openDatabase();
  try {
    await requestResult(db, "readwrite", (store) => store.put(record, RECORD_KEY));
  } finally {
    db.close();
  }
}

/** Deletes the one record. Throws when the database refuses the delete. */
export async function deleteDataset(): Promise<void> {
  const db = await openDatabase();
  try {
    await requestResult(db, "readwrite", (store) => store.delete(RECORD_KEY));
  } finally {
    db.close();
  }
}

/** True when this tab's session still has the visit flag. The flag holds no streams. */
export function readVisitFlag(): boolean {
  try {
    return sessionStorage.getItem(VISIT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Marks this tab's visit as still going. A reload of this tab keeps the flag. */
export function setVisitFlag(): void {
  try {
    sessionStorage.setItem(VISIT_KEY, "1");
  } catch {
    // A blocked session flag does not undo a dataset that is already in memory.
  }
}

/** Clears this tab's visit flag. It does not delete the IndexedDB record. */
export function clearVisitFlag(): void {
  try {
    sessionStorage.removeItem(VISIT_KEY);
  } catch {
    // The caller still treats the visit as over in memory.
  }
}

/**
 * Asks whether another tab still has the visit flag.
 * Posts one question and waits 300 ms. An answer of "mine" means yes.
 * No answer, or no BroadcastChannel, means no. This tab does not answer itself
 * unless its own flag is set, and the caller only asks when that flag is missing.
 */
export function otherTabOwnsVisit(): Promise<boolean> {
  const channel = visitChannel();
  if (!channel) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (owns: boolean) => {
      if (settled) return;
      settled = true;
      channel.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      resolve(owns);
    };
    const onMessage = (event: MessageEvent) => {
      if (isVisitMessage(event.data) && event.data.type === "mine") finish(true);
    };
    const timer = window.setTimeout(() => finish(false), VISIT_ANSWER_MS);
    channel.addEventListener("message", onMessage);
    channel.postMessage({ type: "who-owns-visit" });
  });
}

/** Starts the listener that answers other tabs from this tab's own flag. */
export function listenForVisit(): void {
  visitChannel();
}

/** The store the provider uses. Tests pass a fake with the same methods. */
export const browserDatasetStore: DatasetStore = {
  getDataset,
  putDataset,
  deleteDataset,
  readVisitFlag,
  setVisitFlag,
  clearVisitFlag,
  otherTabOwnsVisit,
  listenForVisit,
};

let channel: BroadcastChannel | null | undefined;

/**
 * The one channel for this tab, created on first use.
 * Returns null when the browser has no BroadcastChannel.
 * A tab answers "mine" only when its own visit flag is set.
 */
function visitChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (typeof BroadcastChannel !== "function") {
    channel = null;
    return null;
  }
  const created = new BroadcastChannel(VISIT_CHANNEL);
  created.addEventListener("message", (event: MessageEvent) => {
    if (!isVisitMessage(event.data) || event.data.type !== "who-owns-visit") return;
    if (!readVisitFlag()) return;
    created.postMessage({ type: "mine" });
  });
  channel = created;
  return created;
}

function isVisitMessage(value: unknown): value is { type: string } {
  return isRecord(value) && typeof value.type === "string";
}

/**
 * Opens the database. A synchronous failure becomes a rejected promise.
 * The first open creates the object store. Callers catch a rejected open.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB is unavailable."));
    } catch (error) {
      reject(error instanceof Error ? error : new Error("IndexedDB is unavailable."));
    }
  });
}

/** Runs one request on the dataset store and resolves with its result. */
function requestResult<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The dataset store request failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The dataset store request failed."));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True when the value has the dataset fields the app reads back. */
function isDataset(value: unknown): value is Dataset {
  if (!isRecord(value) || !isRecord(value.meta) || !Array.isArray(value.streams)) return false;
  if (!isMeta(value.meta)) return false;
  if (value.streams.length === 0) return true;
  const first = value.streams[0];
  return isRecord(first) && typeof first.endedAt === "string" && typeof first.msPlayed === "number";
}

/** True when the summary has the counts, the range, and a list of file names. */
function isMeta(value: Record<string, unknown>): value is DatasetMeta {
  return (
    typeof value.streamCount === "number" &&
    typeof value.musicCount === "number" &&
    typeof value.podcastCount === "number" &&
    typeof value.ignoredVideoFiles === "number" &&
    isNullableString(value.minEndedAt) &&
    isNullableString(value.maxEndedAt) &&
    Array.isArray(value.sourceFiles) &&
    value.sourceFiles.every((name) => typeof name === "string")
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
