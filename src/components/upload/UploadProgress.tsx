/**
 * Progress for the upload that is currently parsing.
 * The count is how many files have finished. The name is the base name only.
 */

import { baseName } from "@/data/ingest/classifyFile";
import type { ParseProgress } from "@/state/datasetReducer";
import styles from "./UploadProgress.module.css";

type UploadProgressProps = {
  progress: ParseProgress;
};

/**
 * Renders the progress bar and the file count.
 * Input is the parse progress from the dataset.
 * A total of zero, before the first report, shows the sentence without a count.
 */
export function UploadProgress({ progress }: UploadProgressProps) {
  const total = progress.total;
  const done = progress.done;
  const label = total === 0 ? "Reading files…" : `Reading files… ${done} of ${total}`;
  const fileName = progress.fileName ? baseName(progress.fileName) : null;

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <p className={styles.label}>{label}</p>
      {total > 0 ? (
        <progress className={styles.bar} value={done} max={total} />
      ) : (
        <progress className={styles.bar} />
      )}
      {fileName ? <p className={styles.file}>{fileName}</p> : null}
    </div>
  );
}
