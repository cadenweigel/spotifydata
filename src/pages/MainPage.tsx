/**
 * Home page. An empty visit explains the upload. A loaded visit shows the
 * summary and the links to the other pages. Parsing replaces that with progress.
 */

import { useEffect, useMemo } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { IssueList } from "@/components/upload/IssueList";
import { UploadProgress } from "@/components/upload/UploadProgress";
import { PAST_YEAR_EXPORT_MESSAGE } from "@/data/ingest/readFiles";
import { NOTHING_SAVED_MESSAGE } from "@/state/datasetReducer";
import { useDataset } from "@/state/useDataset";
import { usePrefs } from "@/state/usePrefs";
import { EmptyUpload, type EmptyNotice } from "@/components/main/EmptyUpload";
import { summarizeListening } from "@/components/main/listenSummary";
import { PageCards } from "@/components/main/PageCards";
import { SummaryCard } from "@/components/main/SummaryCard";
import { VisitActions } from "@/components/main/VisitActions";
import pageStyles from "./Page.module.css";
import styles from "./MainPage.module.css";

/** Sets the document title and renders the home page. */
export function MainPage() {
  const data = useDataset();
  const [prefs] = usePrefs();

  useEffect(() => {
    document.title = "Spotify Data";
  }, []);

  const summary = useMemo(() => {
    if (!data.dataset) return null;
    return summarizeListening(
      data.dataset.streams,
      prefs.streamThresholdMs,
      prefs.includePodcasts,
    );
  }, [data.dataset, prefs.includePodcasts, prefs.streamThresholdMs]);

  if (data.status === "parsing" && data.progress === null && data.dataset === null) {
    return (
      <p className={styles.note} role="status">
        Loading saved data…
      </p>
    );
  }

  const music = data.meta?.musicCount ?? 0;
  const podcasts = data.meta?.podcastCount ?? 0;
  const podcastsOnly =
    data.dataset !== null && music === 0 && podcasts > 0 && !prefs.includePodcasts;
  const parsing = data.status === "parsing";
  const hub = data.dataset !== null && !podcastsOnly && !parsing;
  const pastYear =
    data.dataset === null &&
    data.fileErrors.some((error) => error.message === PAST_YEAR_EXPORT_MESSAGE);
  const noHistory =
    data.status === "empty" &&
    data.dataset === null &&
    !pastYear &&
    (data.fileErrors.length > 0 || data.warnings.length > 0);
  const notice: EmptyNotice = podcastsOnly
    ? "podcasts"
    : pastYear
      ? "past-year"
      : noHistory
        ? "no-history"
        : "intro";

  return (
    <div className={styles.page}>
      <h1 className={pageStyles.title}>
        {data.dataset ? "Your listening" : "Add your Spotify history"}
      </h1>
      {data.storageError ? (
        <p className={styles.alert} role="alert">
          {data.storageError}
        </p>
      ) : null}
      {data.error && !parsing ? (
        <p className={styles.alert} role="alert">
          {data.error}
        </p>
      ) : null}
      {parsing && data.progress ? <UploadProgress progress={data.progress} /> : null}
      {parsing ? (
        <DropZone
          variant={data.dataset ? "replace" : "zone"}
          disabled
          onFiles={data.loadFiles}
        />
      ) : null}
      {hub && data.dataset && data.meta && summary ? (
        <>
          <IssueList fileErrors={data.fileErrors} warnings={data.warnings} dismissible />
          <SummaryCard
            meta={data.meta}
            summary={summary}
            includePodcasts={prefs.includePodcasts}
          />
          <PageCards />
          <VisitActions>
            <DropZone variant="replace" disabled={false} onFiles={data.loadFiles} />
          </VisitActions>
        </>
      ) : null}
      {!hub && !parsing ? (
        <>
          <EmptyUpload
            notice={notice}
            fileErrors={data.fileErrors}
            warnings={data.warnings}
            onFiles={data.loadFiles}
          />
          {data.isReady ? <VisitActions /> : null}
          {data.nothingSaved ? <p className={styles.note}>{NOTHING_SAVED_MESSAGE}</p> : null}
        </>
      ) : null}
    </div>
  );
}
