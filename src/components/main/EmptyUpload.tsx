/**
 * The home page before a music dataset is ready to browse.
 * Intro, the past-year explanation, the empty result, or the podcasts-only note.
 */

import type { FileError, IngestWarning } from "@/data/types";
import { PAST_YEAR_EXPORT_MESSAGE } from "@/data/ingest/readFiles";
import { EmptyState } from "@/components/common/EmptyState";
import { ExtendedHistoryLink } from "@/components/common/ExtendedHistoryLink";
import { DropZone } from "@/components/upload/DropZone";
import { IssueList } from "@/components/upload/IssueList";
import styles from "./EmptyUpload.module.css";

/** Which explanation the empty screen leads with. */
export type EmptyNotice = "intro" | "past-year" | "no-history" | "podcasts";

const NEEDED_FILES: [string, string][] = [
  ["Streaming_History_Audio_*.json", "Lifetime audio. This is the file this app reads."],
  ["endsong_*.json", "Older name for the same audio."],
  ["A .zip or a folder", "The export can be dropped as a zip, or chosen with Upload folder."],
  ["Streaming_History_Video_*.json", "Video history. It is ignored."],
  [
    "StreamingHistory_music_*.json and StreamingHistory_podcast_*.json",
    "The past-year package. It is not supported.",
  ],
  ["StreamingHistory0.json", "Older past-year name. It is not supported."],
];

type EmptyUploadProps = {
  notice: EmptyNotice;
  fileErrors: readonly FileError[];
  warnings: readonly IngestWarning[];
  onFiles: (files: readonly File[]) => void;
};

/**
 * Renders the empty upload screen.
 * Input is which notice to lead with, the ingest issues, and onFiles.
 * A past-year result keeps its own sentence and does not repeat it in the error list.
 */
export function EmptyUpload({ notice, fileErrors, warnings, onFiles }: EmptyUploadProps) {
  const errors =
    notice === "past-year"
      ? fileErrors.filter((error) => error.message !== PAST_YEAR_EXPORT_MESSAGE)
      : fileErrors;
  const notes =
    notice === "past-year"
      ? warnings.filter((warning) => warning.kind !== "unsupportedPastYearFiles")
      : warnings;

  return (
    <div className={styles.stack}>
      {notice === "intro" ? <Intro /> : null}
      {notice === "past-year" ? <PastYear /> : null}
      {notice === "no-history" ? <NoHistory /> : null}
      {notice === "podcasts" ? <PodcastsOnly /> : null}
      {notice === "podcasts" ? null : <WhichFiles />}
      <IssueList fileErrors={errors} warnings={notes} dismissible={false} />
      <DropZone variant="zone" disabled={false} onFiles={onFiles} />
    </div>
  );
}

/** The first-visit explanation: where the files come from, and that they stay here. */
function Intro() {
  return (
    <div className={styles.stack}>
      <p>
        Request your extended streaming history from{" "}
        <ExtendedHistoryLink>Spotify's privacy settings</ExtendedHistoryLink>, then drop
        the files here. It can take a while to arrive.
      </p>
      <p>The shorter past-year "account data" package is not supported yet.</p>
      <p>Files are read in this browser and are never uploaded.</p>
    </div>
  );
}

/** Shown when the upload was only the shorter past-year package. */
function PastYear() {
  return (
    <EmptyState title="Extended history needed">
      <p>{PAST_YEAR_EXPORT_MESSAGE}</p>
      <p>
        <ExtendedHistoryLink>Request the extended streaming history</ExtendedHistoryLink>.
        It can take a while to arrive.
      </p>
    </EmptyState>
  );
}

/** Shown when files were opened and no music or podcast stream survived. */
function NoHistory() {
  return (
    <EmptyState title="No streaming history found">
      <p>
        This can happen when the wrong files were selected, when the files are only video
        or not listening history, or when an export is corrupted.
      </p>
    </EmptyState>
  );
}

/** Shown when the export has podcasts and no music, and podcasts are still off. */
function PodcastsOnly() {
  return (
    <EmptyState title="Podcasts only">
      <p>
        This export has only podcasts. Music is the default, so nothing is shown yet.
        Turn on Include podcasts to see them.
      </p>
    </EmptyState>
  );
}

/** The file-name patterns the parser accepts or skips. */
function WhichFiles() {
  return (
    <details className={styles.files}>
      <summary>Which files do I need?</summary>
      <ul>
        {NEEDED_FILES.map(([name, detail]) => (
          <li key={name}>
            <span className={styles.name}>{name}</span>
            <span className={styles.detail}>{detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
