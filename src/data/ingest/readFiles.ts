/**
 * Reads an upload of loose files or a zip and returns parsed extended-audio JSON.
 * collectFiles flattens a file picker or a drop. readFiles classifies every
 * JSON file by name first, then parses only extended audio, one file at a time.
 * The rows are still Spotify's own objects; normalizing them is a later step.
 */

import { unzip } from "fflate";
import type { FileError, IngestWarning } from "@/data/types";
import { baseName, classifyFile, type FileKind } from "./classifyFile";

/** Files larger than this are rejected and never read. */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

/** Shown when the upload contains past-year files and no extended audio. */
export const PAST_YEAR_EXPORT_MESSAGE =
  "This looks like the past-year export. This app currently needs the extended streaming history.";

const EXPECTED_LIST_MESSAGE = "Expected a list of streams.";

/** Reported after each classified JSON file finishes. */
export type ReadProgress = {
  done: number;
  total: number;
  /** Base name of the file that just finished. */
  fileName: string;
};

/** Extended-audio JSON that parsed as an array. Rows are still Spotify's shape. */
export type ParsedAudioFile = {
  fileName: string;
  size: number;
  rows: unknown[];
};

/** Parsed audio plus the errors and warnings found while reading. */
export type ReadFilesResult = {
  audioFiles: ParsedAudioFile[];
  fileErrors: FileError[];
  warnings: IngestWarning[];
  /** True when no extended-audio file was present and at least one past-year file was. */
  pastYearOnly: boolean;
};

type WorkItem = {
  fileName: string;
  size: number;
  kind: FileKind;
  /** Present only for extended audio, so other files are never opened. */
  readText?: () => Promise<string>;
};

type ZipDecision =
  | { type: "audio"; path: string; fileName: string; size: number }
  | {
      type: "classified";
      fileName: string;
      size: number;
      kind: Exclude<FileKind, "extendedAudio">;
    }
  | { type: "duplicate" }
  | { type: "nestedZip"; fileName: string }
  | { type: "empty"; fileName: string }
  | { type: "tooBig"; fileName: string };

/**
 * Flattens a file picker or a drop into a list of files.
 * Input is a FileList from an <input>, or a DataTransfer from a drop.
 * A folder chosen with webkitdirectory is already flat. A dropped folder is walked.
 * Returns every file, including ones readFiles will later reject.
 */
export async function collectFiles(
  input: FileList | DataTransfer,
): Promise<File[]> {
  // A drop carries items, which may be directories. A file input is only a list.
  if (isDataTransfer(input)) return collectFromTransfer(input);
  return Array.from(input);
}

/**
 * Tells a drop apart from a file input.
 * Input is either value collectFiles accepts.
 * Returns true when the value has an item list, which only a DataTransfer does.
 */
function isDataTransfer(input: FileList | DataTransfer): input is DataTransfer {
  return "items" in input && input.items != null;
}

/**
 * Unzips, classifies, and parses an upload.
 * Input is the files from collectFiles, plus an optional progress callback.
 * Only extended-audio JSON is opened. Other JSON is counted. One bad file
 * does not stop the rest. Returns the parsed rows, file errors, and warnings.
 */
export async function readFiles(
  files: readonly File[],
  onProgress?: (progress: ReadProgress) => void,
): Promise<ReadFilesResult> {
  const fileErrors: FileError[] = [];
  const work: WorkItem[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const file of files) {
    const fileName = baseName(fileLabel(file));

    // Empty and oversized files are rejected from their size, before they are opened.
    if (file.size === 0) {
      fileErrors.push({ fileName, message: emptyMessage(fileName) });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      fileErrors.push({ fileName, message: tooBigMessage(fileName) });
      continue;
    }
    // A zip contributes the JSON files inside it, not the archive itself.
    if (isZipName(fileName)) {
      const expanded = await expandZip(file, fileName, seen);
      if (expanded.errors.length > 0) fileErrors.push(...expanded.errors);
      duplicateCount += expanded.duplicates;
      work.push(...expanded.work);
      continue;
    }
    // PDFs and other non-JSON files are ignored, with no error and no warning.
    if (!isJsonName(fileName)) continue;

    // The same base name and size, ignoring case, is a second copy of one file.
    if (!claim(seen, fileName, file.size)) {
      duplicateCount += 1;
      continue;
    }
    work.push(jsonWorkItem(fileName, file.size, () => file.text()));
  }

  const audioFiles: ParsedAudioFile[] = [];
  let extendedCount = 0;
  let videoCount = 0;
  let pastYearCount = 0;
  let otherCount = 0;
  let firstPastYear = "";
  const total = work.length;

  for (let index = 0; index < work.length; index += 1) {
    const item = work[index];
    // Extended audio is the only kind whose contents are read.
    if (item.kind === "extendedAudio") {
      extendedCount += 1;
      await parseAudioFile(item, audioFiles, fileErrors);
    } else if (item.kind === "video") {
      // Video history is counted and skipped.
      videoCount += 1;
    } else if (item.kind === "pastYearUnsupported") {
      // The shorter past-year export is counted and skipped.
      pastYearCount += 1;
      if (!firstPastYear) firstPastYear = item.fileName;
    } else {
      // Playlists and other account JSON.
      otherCount += 1;
    }
    onProgress?.({ done: index + 1, total, fileName: item.fileName });
  }

  // No lifetime history, but at least one past-year file: explain that specifically.
  const pastYearOnly = extendedCount === 0 && pastYearCount > 0;
  if (pastYearOnly) {
    fileErrors.push({
      fileName: firstPastYear,
      message: PAST_YEAR_EXPORT_MESSAGE,
    });
  }

  const warnings: IngestWarning[] = [];
  if (videoCount > 0) {
    warnings.push({ kind: "ignoredVideoFiles", count: videoCount });
  }
  if (otherCount > 0) {
    warnings.push({ kind: "ignoredOtherFiles", count: otherCount });
  }
  if (pastYearCount > 0) {
    warnings.push({ kind: "unsupportedPastYearFiles", count: pastYearCount });
  }
  if (duplicateCount > 0) {
    warnings.push({ kind: "duplicateFiles", count: duplicateCount });
  }

  return { audioFiles, fileErrors, warnings, pastYearOnly };
}

/**
 * Returns the path used to classify a file.
 * A folder upload stores the real path on webkitRelativePath. file.name is only the last segment.
 * Returns that relative path when it is set, otherwise file.name.
 */
function fileLabel(file: File): string {
  return file.webkitRelativePath || file.name;
}

/**
 * Returns true when the base name ends in .json, ignoring case.
 * Input is already a base name, not a directory path.
 */
function isJsonName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".json");
}

/**
 * Returns true when the base name ends in .zip, ignoring case.
 * Input is already a base name, not a directory path.
 */
function isZipName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".zip");
}

/**
 * Reserves a file so a later copy can be detected.
 * Input is the set of files already kept, plus this file's base name and size.
 * The key ignores case in the name. Returns true the first time, and false
 * when this name and size were already reserved.
 */
function claim(seen: Set<string>, fileName: string, size: number): boolean {
  const key = `${fileName.toLowerCase()}\0${size}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/**
 * Classifies one loose JSON file and records it for the progress loop.
 * Input is the base name, the size, and a function that reads the file text.
 * Returns a work item. Only extended audio keeps readText, so other files are never opened.
 */
function jsonWorkItem(
  fileName: string,
  size: number,
  readText: () => Promise<string>,
): WorkItem {
  const kind = classifyFile(fileName);
  // Keep the reader only for the kind that will be parsed.
  if (kind === "extendedAudio") {
    return { fileName, size, kind, readText };
  }
  return { fileName, size, kind };
}

/**
 * Unzips one archive into work items, errors, and a duplicate count.
 * Input is the zip file, its base name, and the names already reserved by earlier files.
 * The filter inflates extended-audio JSON only. A corrupt or password-protected
 * archive returns a file error and does not throw. Nested zips are not opened.
 */
async function expandZip(
  file: File,
  fileName: string,
  seen: Set<string>,
): Promise<{ work: WorkItem[]; errors: FileError[]; duplicates: number }> {
  let zipped: Uint8Array;
  try {
    zipped = new Uint8Array(await file.arrayBuffer());
  } catch {
    return {
      work: [],
      errors: [{ fileName, message: couldNotRead(fileName) }],
      duplicates: 0,
    };
  }

  const decisions: ZipDecision[] = [];
  const localSeen = new Set(seen);
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = await unzipArchive(zipped, (info) => {
      const path = info.name;
      // Folder entries and __MACOSX junk are not files the user chose.
      if (isSkippableZipPath(path)) return false;

      const entryName = baseName(path);
      // A zip inside this zip is not supported. Record it and do not inflate it.
      if (isZipName(entryName)) {
        decisions.push({ type: "nestedZip", fileName: entryName });
        return false;
      }
      // Reject from the uncompressed size before spending memory on the bytes.
      if (info.originalSize <= 0) {
        decisions.push({ type: "empty", fileName: entryName });
        return false;
      }
      if (info.originalSize > MAX_FILE_BYTES) {
        decisions.push({ type: "tooBig", fileName: entryName });
        return false;
      }
      // The PDF readme and other non-JSON entries are ignored with no warning.
      if (!isJsonName(entryName)) return false;
      // Same base name and size as a file already kept, inside or outside this zip.
      if (!claim(localSeen, entryName, info.originalSize)) {
        decisions.push({ type: "duplicate" });
        return false;
      }

      const kind = classifyFile(entryName);
      // Returning true is what makes fflate inflate the entry.
      if (kind === "extendedAudio") {
        decisions.push({
          type: "audio",
          path,
          fileName: entryName,
          size: info.originalSize,
        });
        return true;
      }
      // Video, past-year, and other JSON are classified without being inflated.
      decisions.push({
        type: "classified",
        fileName: entryName,
        size: info.originalSize,
        kind,
      });
      return false;
    });
  } catch {
    return {
      work: [],
      errors: [{ fileName, message: couldNotUnzip(fileName) }],
      duplicates: 0,
    };
  }

  for (const key of localSeen) seen.add(key);

  const work: WorkItem[] = [];
  const errors: FileError[] = [];
  let duplicates = 0;

  // Turn each filter decision into an error or a work item. Audio bytes are dropped after decoding.
  for (const decision of decisions) {
    if (decision.type === "duplicate") {
      duplicates += 1;
      continue;
    }
    if (decision.type === "nestedZip") {
      errors.push({
        fileName: decision.fileName,
        message: nestedZipMessage(decision.fileName),
      });
      continue;
    }
    if (decision.type === "empty") {
      errors.push({
        fileName: decision.fileName,
        message: emptyMessage(decision.fileName),
      });
      continue;
    }
    if (decision.type === "tooBig") {
      errors.push({
        fileName: decision.fileName,
        message: tooBigMessage(decision.fileName),
      });
      continue;
    }
    if (decision.type === "classified") {
      work.push({
        fileName: decision.fileName,
        size: decision.size,
        kind: decision.kind,
      });
      continue;
    }

    let bytes: Uint8Array | null = unzipped[decision.path] ?? null;
    delete unzipped[decision.path];
    if (!bytes) {
      errors.push({
        fileName: decision.fileName,
        message: couldNotRead(decision.fileName),
      });
      continue;
    }
    work.push({
      fileName: decision.fileName,
      size: decision.size,
      kind: "extendedAudio",
      readText: () => {
        const current = bytes;
        bytes = null;
        if (!current) return Promise.resolve("");
        return Promise.resolve(decodeUtf8(current));
      },
    });
  }

  return { work, errors, duplicates };
}

/**
 * Returns true when a zip entry should be ignored completely.
 * Input is the entry path inside the archive.
 * A trailing slash is a directory. Any __MACOSX segment is AppleDouble junk.
 */
function isSkippableZipPath(path: string): boolean {
  if (path.endsWith("/")) return true;
  return path.split("/").includes("__MACOSX");
}

/**
 * Wraps fflate's callback-style unzip in a promise.
 * Input is the zip bytes and a filter. The filter returns true for entries to inflate.
 * Resolves to path-to-bytes for those entries. Rejects when the archive cannot be read.
 */
function unzipArchive(
  data: Uint8Array,
  filter: (file: {
    name: string;
    size: number;
    originalSize: number;
    compression: number;
  }) => boolean,
): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, { filter }, (error, result) => {
      if (error || !result) {
        reject(error ?? new Error("unzip failed"));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Reads one extended-audio file and appends it when the JSON is a list.
 * Input is the work item plus the result arrays to append to.
 * A failure adds a FileError and returns. The rows stay in Spotify's shape.
 */
async function parseAudioFile(
  item: WorkItem,
  audioFiles: ParsedAudioFile[],
  fileErrors: FileError[],
): Promise<void> {
  // Non-audio items never have a reader. Reaching this means the item was misbuilt.
  if (!item.readText) {
    fileErrors.push({
      fileName: item.fileName,
      message: couldNotRead(item.fileName),
    });
    return;
  }

  let text = "";
  try {
    text = stripBom(await item.readText());
  } catch {
    // The file could not be opened. The message does not include its contents.
    fileErrors.push({
      fileName: item.fileName,
      message: couldNotRead(item.fileName),
    });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fileErrors.push({
      fileName: item.fileName,
      message: invalidJsonMessage(item.fileName),
    });
    return;
  } finally {
    // Drop the raw text so a large file can be collected before the next one is read.
    text = "";
  }

  // Spotify history files are arrays. An object is a different export shape.
  if (!Array.isArray(parsed)) {
    fileErrors.push({
      fileName: item.fileName,
      message: EXPECTED_LIST_MESSAGE,
    });
    return;
  }

  audioFiles.push({
    fileName: item.fileName,
    size: item.size,
    rows: parsed,
  });
}

const textDecoder = new TextDecoder("utf-8");

/** Decodes zip-entry bytes as UTF-8. A leading BOM is left for stripBom to remove. */
function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/**
 * Removes a leading byte-order mark when one is present.
 * Input is the file text. Returns the same text when it does not start with U+FEFF,
 * so JSON.parse sees the array instead of the mark.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Error text for a zero-byte file. The name is the base name. */
function emptyMessage(fileName: string): string {
  return `\`${fileName}\` is empty.`;
}

/** Error text for a file over MAX_FILE_BYTES. The name is the base name. */
function tooBigMessage(fileName: string): string {
  return `\`${fileName}\` is larger than 500 MB and was skipped.`;
}

/** Error text for text that is not JSON. The file contents are not included. */
function invalidJsonMessage(fileName: string): string {
  return `\`${fileName}\` is not valid JSON.`;
}

/** Error text for a corrupt or password-protected zip. */
function couldNotUnzip(fileName: string): string {
  return `\`${fileName}\` could not be unzipped.`;
}

/** Error text for a zip stored inside another zip. Nested archives are not opened. */
function nestedZipMessage(fileName: string): string {
  return `\`${fileName}\` is a nested zip and was skipped.`;
}

/** Error text for a file whose bytes could not be read. */
function couldNotRead(fileName: string): string {
  return `\`${fileName}\` could not be read.`;
}

/**
 * Reads the files out of a drop.
 * Input is the DataTransfer from the drop event.
 * When the browser can describe directories, those are walked.
 * Otherwise the drop's flat file list is returned.
 */
async function collectFromTransfer(transfer: DataTransfer): Promise<File[]> {
  const items = Array.from(transfer.items);
  const canWalk = items.some(
    (item) => typeof item.webkitGetAsEntry === "function",
  );
  // No directory API: the drop is a flat list of files.
  if (!canWalk) return Array.from(transfer.files);

  const files: File[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (entry) {
      files.push(...(await filesFromEntry(entry)));
      continue;
    }
    // Some items have no entry. Fall back to the file itself.
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

/**
 * Collects every file under one dropped entry.
 * Input is a file or a directory from webkitGetAsEntry.
 * A file returns that one File. A directory returns the files inside it, including nested folders.
 */
async function filesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await fileFromEntry(entry as FileSystemFileEntry)];
  }
  // Neither a file nor a folder. Nothing to collect.
  if (!entry.isDirectory) return [];

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children = await readAllEntries(reader);
  const files: File[] = [];
  for (const child of children) {
    files.push(...(await filesFromEntry(child)));
  }
  return files;
}

/**
 * Reads every child of a directory entry.
 * Input is the directory's reader. Browsers return children in batches, so this
 * keeps calling readEntries until a batch is empty. Returns the children in that order.
 */
function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

/**
 * Turns one dropped file entry into a File.
 * Input is a FileSystemFileEntry. The browser API uses a callback, so this returns a promise.
 */
function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}
