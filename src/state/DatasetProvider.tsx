/**
 * Holds one dataset for every page during this visit.
 * Parsing runs through the worker client, then the reducer stores the
 * result. A successful parse is written to the store. A failed parse
 * leaves the previous dataset in place and writes nothing.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { Dataset, Stream } from "@/data/types";
import { browserDatasetStore, type DatasetStore } from "./datasetStore";
import { datasetReducer, initialDatasetState } from "./datasetReducer";
import { clearVisit, loadVisit, storeDataset } from "./persistVisit";
import { DatasetContext, type DatasetContextValue } from "./useDataset";
import { startParse, type ParseSession } from "./workerClient";

const EMPTY_STREAMS: Stream[] = [];

type DatasetProviderProps = {
  children: ReactNode;
  /** Defaults to IndexedDB. Tests pass a fake with the same methods. */
  store?: DatasetStore;
};

/** Makes the dataset, its status, and loadFiles available under this tree. */
export function DatasetProvider({
  children,
  store = browserDatasetStore,
}: DatasetProviderProps) {
  const [state, dispatch] = useReducer(datasetReducer, initialDatasetState);
  const sessionRef = useRef<ParseSession | null>(null);
  const generationRef = useRef(0);
  const writeGenerationRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const writesSkippedRef = useRef(false);
  const durableRef = useRef(false);
  const datasetRef = useRef<Dataset | null>(null);
  const savingRef = useRef(false);
  datasetRef.current = state.dataset;

  const enqueue = useCallback((task: () => Promise<void>) => {
    writeChainRef.current = writeChainRef.current
      .catch(() => undefined)
      .then(task)
      .then(
        () => undefined,
        () => undefined,
      );
  }, []);

  useEffect(() => {
    let active = true;
    void loadVisit(store).then((outcome) => {
      if (!active) return;
      if (outcome.type === "ready") {
        durableRef.current = outcome.durable;
        dispatch({
          type: "startup-ready",
          dataset: outcome.dataset,
          durable: outcome.durable,
        });
        return;
      }
      if (outcome.type === "storage-error") {
        writesSkippedRef.current = true;
        dispatch({ type: "startup-failed" });
        return;
      }
      dispatch({ type: "startup-empty" });
    });
    return () => {
      active = false;
    };
  }, [store]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      writeGenerationRef.current += 1;
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
  }, []);

  const rememberDataset = useCallback(
    (dataset: Dataset, generation: number) => {
      if (writesSkippedRef.current) {
        durableRef.current = false;
        dispatch({ type: "storage-failed", keepDurable: false });
        return;
      }
      const writeGeneration = writeGenerationRef.current;
      enqueue(async () => {
        if (writeGenerationRef.current !== writeGeneration) return;
        if (generationRef.current !== generation) return;
        const outcome = await storeDataset(store, dataset, durableRef.current);
        if (writeGenerationRef.current !== writeGeneration) return;
        if (generationRef.current !== generation) return;
        if (outcome === "failed") {
          writesSkippedRef.current = true;
          durableRef.current = false;
          dispatch({ type: "storage-failed", keepDurable: false });
        }
      });
    },
    [enqueue, store],
  );

  const loadFiles = useCallback(
    (files: readonly File[]) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      sessionRef.current?.cancel();
      dispatch({ type: "parse-start" });
      sessionRef.current = startParse(files, {
        onProgress: (progress) => {
          if (generationRef.current !== generation) return;
          dispatch({ type: "parse-progress", ...progress });
        },
        onDone: (result) => {
          if (generationRef.current !== generation) return;
          sessionRef.current = null;
          dispatch({ type: "parse-done", result });
          if (result.dataset) rememberDataset(result.dataset, generation);
        },
        onError: () => {
          if (generationRef.current !== generation) return;
          sessionRef.current = null;
          dispatch({ type: "parse-failed" });
        },
      });
    },
    [rememberDataset],
  );

  const save = useCallback(() => {
    if (!datasetRef.current || durableRef.current || writesSkippedRef.current || savingRef.current) {
      return;
    }
    savingRef.current = true;
    dispatch({ type: "save-started" });
    const writeGeneration = writeGenerationRef.current;
    enqueue(async () => {
      const dataset = datasetRef.current;
      if (writeGenerationRef.current !== writeGeneration || !dataset || writesSkippedRef.current) {
        savingRef.current = false;
        dispatch({ type: "save-idle" });
        return;
      }
      const outcome = await storeDataset(store, dataset, true);
      if (writeGenerationRef.current !== writeGeneration) {
        savingRef.current = false;
        dispatch({ type: "save-idle" });
        return;
      }
      savingRef.current = false;
      if (outcome === "failed") {
        writesSkippedRef.current = true;
        durableRef.current = false;
        dispatch({ type: "storage-failed", keepDurable: false });
        return;
      }
      durableRef.current = true;
      dispatch({ type: "save-finished" });
    });
  }, [enqueue, store]);

  const clearSaved = useCallback(() => {
    const generation = generationRef.current;
    writeGenerationRef.current += 1;
    enqueue(async () => {
      const outcome = await clearVisit(store);
      if (generationRef.current !== generation) return;
      savingRef.current = false;
      if (!outcome.ok) {
        writesSkippedRef.current = true;
        dispatch({ type: "storage-failed", keepDurable: true });
        return;
      }
      durableRef.current = false;
      writesSkippedRef.current = outcome.readFailed;
      dispatch({ type: "cleared", nothingSaved: outcome.nothingSaved });
      if (outcome.readFailed) dispatch({ type: "storage-failed", keepDurable: false });
    });
  }, [enqueue, store]);

  const meta = state.dataset?.meta ?? null;
  const isReady = state.status === "ready" && state.dataset !== null;
  const filteredStreams = useMemo(
    () => state.dataset?.streams ?? EMPTY_STREAMS,
    [state.dataset],
  );

  const value = useMemo<DatasetContextValue>(
    () => ({
      dataset: state.dataset,
      meta,
      status: state.status,
      error: state.error,
      sourceLabel: state.sourceLabel,
      fileErrors: state.fileErrors,
      warnings: state.warnings,
      storageError: state.storageError,
      progress: state.progress,
      isReady,
      filteredStreams,
      loadFiles,
      durable: state.durable,
      saving: state.saving,
      nothingSaved: state.nothingSaved,
      writesSkipped: state.writesSkipped,
      save,
      clearSaved,
    }),
    [state, meta, isReady, filteredStreams, loadFiles, save, clearSaved],
  );

  return (
    <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>
  );
}
