/**
 * One line in the nav: music streams above the listen-time setting, and the date range.
 * The count follows the threshold. The dates are the loaded dataset's first and last stream.
 */

import { useMemo } from "react";
import { formatDate, formatInt } from "@/data/format";
import { summarizeListening } from "@/components/main/listenSummary";
import { useDataset } from "@/state/useDataset";
import { usePrefs } from "@/state/usePrefs";
import styles from "./DatasetSummary.module.css";

/**
 * Renders the chrome summary.
 * Input is none. The dataset and the threshold come from the providers.
 * Returns nothing when no dataset is loaded.
 */
export function DatasetSummary() {
  const { dataset, meta } = useDataset();
  const [prefs] = usePrefs();
  const included = useMemo(() => {
    if (!dataset) return 0;
    return summarizeListening(dataset.streams, prefs.streamThresholdMs, false).included;
  }, [dataset, prefs.streamThresholdMs]);

  if (!dataset || !meta) return null;

  const range =
    meta.minEndedAt && meta.maxEndedAt
      ? `${formatDate(meta.minEndedAt)} – ${formatDate(meta.maxEndedAt)}`
      : null;
  const text = range
    ? `${formatInt(included)} ${included === 1 ? "stream" : "streams"} · ${range}`
    : `${formatInt(included)} ${included === 1 ? "stream" : "streams"}`;

  return <p className={styles.summary}>{text}</p>;
}
