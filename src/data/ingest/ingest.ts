/**
 * Turns an upload into a dataset or a list of file errors.
 * ingest calls readFiles, then normalizeFiles, then computeMeta.
 * One bad file does not stop the rest. A dataset is returned only when
 * at least one music or podcast stream survived. Two extended files with
 * different names are both kept, even when their rows overlap.
 */

import type { IngestResult, IngestWarning } from "@/data/types";
import { computeMeta } from "./meta";
import type { FileNormalizeCounts } from "./normalize";
import { normalizeFiles } from "./normalize";
import type { ParsedAudioFile, ReadProgress } from "./readFiles";
import { readFiles } from "./readFiles";

/**
 * Reads an upload and returns the ingest result.
 * Input is the flat file list from collectFiles, plus an optional progress
 * callback that readFiles calls after each JSON file.
 * Returns a dataset when any stream survived, or null when none did.
 * File errors and warnings are returned either way.
 */
export async function ingest(
  files: readonly File[],
  onProgress?: (progress: ReadProgress) => void,
): Promise<IngestResult> {
  const read = await readFiles(files, onProgress);
  const normalized = normalizeFiles(read.audioFiles);
  const warnings = [
    ...rowWarnings(normalized.files),
    ...read.warnings,
  ];

  if (normalized.streams.length === 0) {
    return { dataset: null, fileErrors: read.fileErrors, warnings };
  }

  return {
    dataset: {
      meta: computeMeta(
        normalized.streams,
        filesThatContributed(read.audioFiles, normalized.files),
        { ignoredVideoFiles: ignoredVideoCount(read.warnings) },
      ),
      streams: normalized.streams,
    },
    fileErrors: read.fileErrors,
    warnings,
  };
}

/**
 * Base names of extended-audio files that kept at least one row.
 * Input is the parsed files and the per-file skip counts, in the same order.
 * A file whose every row was skipped is left out. Order is the read order.
 */
function filesThatContributed(
  audioFiles: readonly ParsedAudioFile[],
  counts: readonly FileNormalizeCounts[],
): string[] {
  const names: string[] = [];
  for (let index = 0; index < audioFiles.length; index += 1) {
    const kept = audioFiles[index].rows.length - counts[index].rejected;
    if (kept > 0) names.push(audioFiles[index].fileName);
  }
  return names;
}

/**
 * Warnings for skipped rows and clamped play times.
 * Input is the per-file counts from normalizeFiles.
 * One warning per file that skipped a row, then one per file that clamped
 * a time. A count of zero is left out.
 */
function rowWarnings(files: readonly FileNormalizeCounts[]): IngestWarning[] {
  const rejected: IngestWarning[] = [];
  const clamped: IngestWarning[] = [];
  for (const file of files) {
    if (file.rejected > 0) {
      rejected.push({
        kind: "rejectedRows",
        count: file.rejected,
        fileName: file.fileName,
      });
    }
    if (file.clamped > 0) {
      clamped.push({
        kind: "clampedTimes",
        count: file.clamped,
        fileName: file.fileName,
      });
    }
  }
  return [...rejected, ...clamped];
}

/**
 * How many video files readFiles classified.
 * Input is the warnings from that step. Returns 0 when video was absent.
 */
function ignoredVideoCount(warnings: readonly IngestWarning[]): number {
  for (const warning of warnings) {
    if (warning.kind === "ignoredVideoFiles") return warning.count;
  }
  return 0;
}
