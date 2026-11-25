/**
 * The totals for the dataset currently on screen.
 * The numbers come from summarizeListening. This component only formats them.
 */

import { Fragment } from "react";
import type { DatasetMeta } from "@/data/types";
import { formatDateTime, formatDuration, formatInt } from "@/data/format";
import type { ListenSummary } from "./listenSummary";
import styles from "./SummaryCard.module.css";

type SummaryCardProps = {
  meta: DatasetMeta;
  summary: ListenSummary;
  /** True when the podcast setting is on. The sentence says the numbers include them. */
  includePodcasts: boolean;
};

/**
 * Renders the summary card.
 * Input is the dataset meta, the computed summary, and the podcast setting.
 * Dates are the user's local time. A missing date is "None".
 */
export function SummaryCard({ meta, summary, includePodcasts }: SummaryCardProps) {
  const rows: [string, string][] = [
    ["Streams", formatInt(summary.included)],
    ["Left out by listen time", formatInt(summary.excludedByThreshold)],
    ["Total listen time", formatDuration(summary.listenTimeMs)],
    ["Artists", formatInt(summary.artistCount)],
    ["Tracks", formatInt(summary.trackCount)],
    ["First stream", summary.firstEndedAt ? formatDateTime(summary.firstEndedAt) : "None"],
    ["Last stream", summary.lastEndedAt ? formatDateTime(summary.lastEndedAt) : "None"],
    ["Files", formatInt(meta.sourceFiles.length)],
  ];

  return (
    <section className={styles.card} aria-labelledby="listen-summary">
      <h2 id="listen-summary" className={styles.title}>
        Summary
      </h2>
      <dl className={styles.list}>
        {rows.map(([term, value]) => (
          <Fragment key={term}>
            <dt className={styles.term}>{term}</dt>
            <dd className={styles.value}>{value}</dd>
          </Fragment>
        ))}
      </dl>
      {includePodcasts && meta.podcastCount > 0 ? (
        <p className={styles.note}>Podcasts are included in these numbers.</p>
      ) : null}
      {summary.podcastsLeftOut > 0 ? (
        <p className={styles.note}>
          {formatInt(summary.podcastsLeftOut)}{" "}
          {summary.podcastsLeftOut === 1 ? "podcast play is" : "podcast plays are"} not
          included.
        </p>
      ) : null}
    </section>
  );
}
