/**
 * Plain-language sentences for ingest warnings, and grouping for file errors.
 * The upload screen renders these. Nothing here decides whether a file loaded.
 */

import type { FileError, IngestWarning } from "@/data/types";
import { formatInt } from "@/data/format";

/** How many file errors are shown before "Show all". */
export const ERROR_PREVIEW_LIMIT = 10;

/** One file's errors, in the order they were recorded. */
export type ErrorGroup = {
  fileName: string;
  items: { message: string; index: number }[];
};

/**
 * Writes one warning as a sentence that includes its count.
 * Input is one IngestWarning from an upload.
 * One row uses the singular. Any other count uses the plural.
 */
export function warningSentence(warning: IngestWarning): string {
  const count = formatInt(warning.count);
  const one = warning.count === 1;
  switch (warning.kind) {
    case "rejectedRows":
      return `${count} ${one ? "row" : "rows"} in ${warning.fileName} ${one ? "was" : "were"} skipped because a time or a name was missing.`;
    case "clampedTimes":
      return `${count} ${one ? "play time" : "play times"} in ${warning.fileName} ${one ? "was" : "were"} below zero and ${one ? "was" : "were"} counted as zero.`;
    case "ignoredVideoFiles":
      return `${count} video history ${one ? "file was" : "files were"} skipped.`;
    case "ignoredOtherFiles":
      return `${count} ${one ? "file was" : "files were"} skipped because ${one ? "it is" : "they are"} not streaming history.`;
    case "unsupportedPastYearFiles":
      return `${count} past-year ${one ? "file was" : "files were"} skipped. This app needs the extended streaming history.`;
    case "duplicateFiles":
      return `${count} duplicate ${one ? "file was" : "files were"} skipped.`;
  }
}

/**
 * Groups file errors under their file name.
 * Input is errors in ingest order, each with the index it had in that list.
 * The same file name becomes one group. A later file starts a new group.
 * Returns the groups in first-seen order.
 */
export function groupFileErrors(
  items: readonly { fileName: string; message: string; index: number }[],
): ErrorGroup[] {
  const order: string[] = [];
  const byName = new Map<string, { message: string; index: number }[]>();
  for (const item of items) {
    const existing = byName.get(item.fileName);
    if (existing) {
      existing.push({ message: item.message, index: item.index });
      continue;
    }
    order.push(item.fileName);
    byName.set(item.fileName, [{ message: item.message, index: item.index }]);
  }
  return order.map((fileName) => ({
    fileName,
    items: byName.get(fileName) ?? [],
  }));
}

/**
 * Keeps the first `limit` errors and drops the rest of a later group.
 * Input is grouped errors and how many messages may be shown.
 * A group that starts before the limit is kept, shortened if it would pass it.
 * Returns the groups that fit.
 */
export function limitErrorGroups(
  groups: readonly ErrorGroup[],
  limit: number,
): ErrorGroup[] {
  let remaining = limit;
  const next: ErrorGroup[] = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const items = group.items.slice(0, remaining);
    remaining -= items.length;
    if (items.length > 0) next.push({ fileName: group.fileName, items });
  }
  return next;
}

/**
 * Pairs each file error with its original index.
 * Input is the ingest list. The index stays stable if a row is later hidden.
 */
export function indexFileErrors(
  errors: readonly FileError[],
): { fileName: string; message: string; index: number }[] {
  return errors.map((error, index) => ({
    fileName: error.fileName,
    message: error.message,
    index,
  }));
}
