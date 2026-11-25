/**
 * Gate for Data, Graphs, and Analysis.
 * An empty visit goes back to the upload page. A visit that is still
 * parsing stays here and shows progress, so a refresh is not bounced
 * before the saved data can load.
 */

import { Navigate, Outlet } from "react-router-dom";
import type { ParseProgress } from "@/state/datasetReducer";
import { useDataset } from "@/state/useDataset";
import styles from "./RequireDataset.module.css";

/** Renders the child route when a dataset is ready, and the progress view while parsing. */
export function RequireDataset() {
  const { status, progress, isReady } = useDataset();

  if (status === "parsing") {
    return <ParseProgressView progress={progress} />;
  }
  if (!isReady) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/**
 * Progress copy for a visit that is not ready yet.
 * Input is the file progress, or null while the saved visit is loading.
 * Returns the sentence the guard shows instead of the page.
 */
function progressMessage(progress: ParseProgress | null): string {
  if (!progress) return "Loading saved data…";
  if (progress.total === 0) return "Reading files…";
  return `Reading files… ${progress.done} of ${progress.total}`;
}

/** Shows the parsing sentence. The page underneath is not mounted. */
function ParseProgressView({ progress }: { progress: ParseProgress | null }) {
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <p className={styles.message}>{progressMessage(progress)}</p>
      {progress?.fileName ? (
        <p className={styles.detail}>{progress.fileName}</p>
      ) : null}
    </div>
  );
}
