/**
 * Read access to the dataset shared by every page.
 * The provider owns the value. A page that calls this outside that
 * provider gets a clear error instead of a silent empty dataset.
 */

import { createContext, useContext } from "react";
import type {
  Dataset,
  DatasetMeta,
  FileError,
  IngestWarning,
  Stream,
} from "@/data/types";
import type { DatasetStatus, ParseProgress } from "./datasetReducer";

export type DatasetContextValue = {
  dataset: Dataset | null;
  /** Summary of the loaded dataset. Null when nothing is loaded. */
  meta: DatasetMeta | null;
  status: DatasetStatus;
  error: string | null;
  sourceLabel: string | null;
  fileErrors: FileError[];
  warnings: IngestWarning[];
  storageError: string | null;
  progress: ParseProgress | null;
  /** True when a dataset is loaded and the visit is not parsing. */
  isReady: boolean;
  /**
   * Streams pages should read. Section 9 narrows this by the threshold
   * and the podcast setting. Until then it is every stored stream, or
   * an empty list when no dataset is loaded.
   */
  filteredStreams: Stream[];
  /** Parses an upload and replaces the dataset only if that parse succeeds. */
  loadFiles: (files: readonly File[]) => void;
  /** True when this dataset's stored record was saved on this browser. */
  durable: boolean;
  /** True while the save write is in flight. */
  saving: boolean;
  /** True after Clear when the follow-up read finds no record. */
  nothingSaved: boolean;
  /** True after a refused write. Save will not try again this visit. */
  writesSkipped: boolean;
  /** Marks the current dataset durable. Does nothing while a write is skipped. */
  save: () => void;
  /** Deletes the stored record and drops the in-memory dataset. */
  clearSaved: () => void;
};

export const DatasetContext = createContext<DatasetContextValue | null>(null);

/**
 * Reads the shared dataset.
 * Input is none. The provider above this component supplies the value.
 * Returns the dataset, its status, and loadFiles.
 * Throws when there is no provider, so a missing wrap fails loudly.
 */
export function useDataset(): DatasetContextValue {
  const value = useContext(DatasetContext);
  if (value === null) {
    throw new Error("useDataset must be used inside DatasetProvider");
  }
  return value;
}
