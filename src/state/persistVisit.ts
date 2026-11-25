/**
 * Loads, writes, and clears the one stored dataset.
 * The provider calls these after a parse or a button press. A thrown
 * database call comes back as a failed result. It does not throw.
 */

import type { Dataset } from "@/data/types";
import type { DatasetStore, StoredDataset } from "./datasetStore";
import { decideRestore } from "./decideRestore";

export type LoadVisitResult =
  | { type: "ready"; dataset: Dataset; durable: boolean }
  | { type: "empty" }
  | { type: "storage-error" };

export type ClearVisitResult =
  | { ok: false }
  | { ok: true; nothingSaved: boolean; readFailed: boolean };

/**
 * Restores this tab's visit, or leaves the screen empty.
 * Input is the store. A durable record loads. A session record loads when
 * this tab's flag is set. A leftover session record is deleted when no
 * other tab owns it. A thrown read or delete becomes a storage error.
 * Returns the dataset to show, empty, or the storage error.
 */
export async function loadVisit(store: DatasetStore): Promise<LoadVisitResult> {
  store.listenForVisit();

  let record: StoredDataset | null;
  try {
    record = await store.getDataset();
  } catch {
    return { type: "storage-error" };
  }

  const visitFlag = store.readVisitFlag();
  let otherTabOwnsVisit = false;
  if (record && !record.durable && !visitFlag) {
    try {
      otherTabOwnsVisit = await store.otherTabOwnsVisit();
    } catch {
      otherTabOwnsVisit = false;
    }
  }

  const decision = decideRestore({ record, visitFlag, otherTabOwnsVisit });
  if (decision === "load" && record) {
    store.setVisitFlag();
    return { type: "ready", dataset: record.dataset, durable: record.durable };
  }
  if (decision === "empty-and-delete") {
    try {
      await store.deleteDataset();
    } catch {
      return { type: "storage-error" };
    }
  }
  return { type: "empty" };
}

/**
 * Writes the dataset after a successful upload or a save.
 * Input is the store, the dataset, and whether the record stays durable.
 * Sets the visit flag after the write. A thrown write writes nothing and
 * returns "failed". The dataset in memory is the caller's to keep.
 */
export async function storeDataset(
  store: DatasetStore,
  dataset: Dataset,
  durable: boolean,
): Promise<"stored" | "failed"> {
  try {
    await store.putDataset({ schemaVersion: 1, durable, dataset });
  } catch {
    return "failed";
  }
  store.setVisitFlag();
  return "stored";
}

/**
 * Deletes the stored visit, then reads it back.
 * Input is the store. A thrown delete returns ok: false and does not clear
 * the flag. After a delete, the next read decides the empty-screen sentence.
 * A thrown read leaves nothingSaved false.
 */
export async function clearVisit(store: DatasetStore): Promise<ClearVisitResult> {
  try {
    await store.deleteDataset();
  } catch {
    return { ok: false };
  }
  store.clearVisitFlag();
  try {
    const left = await store.getDataset();
    return { ok: true, nothingSaved: left === null, readFailed: false };
  } catch {
    return { ok: true, nothingSaved: false, readFailed: true };
  }
}
