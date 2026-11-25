/**
 * In-memory stand-in for the dataset store. Tests use it instead of IndexedDB.
 * A bad shape is dropped by the same readStoredValue the real store uses.
 */

import {
  readStoredValue,
  type DatasetStore,
  type StoredDataset,
} from "@/state/datasetStore";

export type MemoryDatasetStore = DatasetStore & {
  /** The record a later read would return, after the shape check. */
  read(): StoredDataset | null;
  /** What otherTabOwnsVisit will answer. */
  setOtherTab(owns: boolean): void;
  /** The next put throws, and later puts throw too. */
  failPuts(): void;
  /** The next delete throws. */
  failDeletes(): void;
};

/** An empty store, or one that already holds a record. */
export function memoryDatasetStore(initial: StoredDataset | null = null): MemoryDatasetStore {
  let raw: unknown = initial;
  let flag = false;
  let otherTab = false;
  let putsFail = false;
  let deletesFail = false;

  return {
    read() {
      return readStoredValue(raw).record;
    },
    async getDataset() {
      const settled = readStoredValue(raw);
      if (settled.deleteRecord) raw = null;
      return settled.record;
    },
    async putDataset(record) {
      if (putsFail) throw new Error("quota");
      raw = JSON.parse(JSON.stringify(record)) as StoredDataset;
    },
    async deleteDataset() {
      if (deletesFail) throw new Error("delete refused");
      raw = null;
    },
    readVisitFlag: () => flag,
    setVisitFlag: () => {
      flag = true;
    },
    clearVisitFlag: () => {
      flag = false;
    },
    async otherTabOwnsVisit() {
      return otherTab;
    },
    listenForVisit() {},
    setOtherTab(owns) {
      otherTab = owns;
    },
    failPuts() {
      putsFail = true;
    },
    failDeletes() {
      deletesFail = true;
    },
  };
}
