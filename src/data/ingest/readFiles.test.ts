/**
 * Tests for collectFiles and readFiles. Inputs are small synthetic files and
 * zips, never a real Spotify export. Each test notes its input and expected result.
 */

import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  MAX_FILE_BYTES,
  PAST_YEAR_EXPORT_MESSAGE,
  collectFiles,
  readFiles,
} from "./readFiles";

beforeAll(() => {
  installBlobReaders();
});

function fileNamed(name: string, contents: string): File {
  return new File([contents], name);
}

describe("readFiles", () => {
  // Parses one extended-audio file and leaves the rows in Spotify's shape.
  // Input: Streaming_History_Audio_2019.json containing one play.
  // Expected: one audio file with that row, no errors, and pastYearOnly false.
  it("parses an extended audio file and keeps the raw rows", async () => {
    const rows = [{ ts: "2020-01-01T00:00:00Z", ms_played: 1000 }];
    const result = await readFiles([
      fileNamed(
        "Streaming_History_Audio_2019.json",
        JSON.stringify(rows),
      ),
    ]);

    expect(result.audioFiles).toEqual([
      {
        fileName: "Streaming_History_Audio_2019.json",
        size: JSON.stringify(rows).length,
        rows,
      },
    ]);
    expect(result.fileErrors).toEqual([]);
    expect(result.pastYearOnly).toBe(false);
  });

  // A broken extended-audio file fails on its own and does not leak its body.
  // Input: Streaming_History_Audio_2019.json whose text is not JSON and contains a sentinel.
  // Expected: no audio files, one "not valid JSON" error, and the sentinel absent from the result.
  it("reports invalid JSON without quoting the file contents", async () => {
    const result = await readFiles([
      fileNamed(
        "Streaming_History_Audio_2019.json",
        "SENTINEL_ROW_SECRET {",
      ),
    ]);

    expect(result.audioFiles).toEqual([]);
    expect(result.fileErrors).toEqual([
      {
        fileName: "Streaming_History_Audio_2019.json",
        message: "`Streaming_History_Audio_2019.json` is not valid JSON.",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("SENTINEL_ROW_SECRET");
  });

  // Extended audio must be a JSON array. An object is a different Spotify file shape.
  // Input: endsong_0.json containing one JSON object.
  // Expected: a file error, "Expected a list of streams."
  it("rejects a JSON value that is not a list", async () => {
    const result = await readFiles([
      fileNamed("endsong_0.json", JSON.stringify({ ts: "nope" })),
    ]);

    expect(result.fileErrors).toEqual([
      { fileName: "endsong_0.json", message: "Expected a list of streams." },
    ]);
  });

  // A byte-order mark at the start of a file must not make otherwise valid JSON fail.
  // Input: Streaming_History_Audio_1.json starting with a BOM, then [{"a":1}].
  // Expected: one row, { a: 1 }, and no file errors.
  it("strips a leading BOM before parsing", async () => {
    const result = await readFiles([
      fileNamed("Streaming_History_Audio_1.json", '\uFEFF[{"a":1}]'),
    ]);

    expect(result.audioFiles[0]?.rows).toEqual([{ a: 1 }]);
    expect(result.fileErrors).toEqual([]);
  });

  // Files that are not extended audio are classified and never opened.
  // Input: a past-year file, a video file, and Inferences.json, each with a secret body.
  // Expected: text() is never called, there are no audio files, pastYearOnly is true,
  // the past-year message is the only file error, and each kind is counted once.
  it("does not read past-year, video, or other JSON files", async () => {
    const pastYear = fileNamed("StreamingHistory0.json", "PAST_YEAR_SECRET");
    const video = fileNamed(
      "Streaming_History_Video_1.json",
      "VIDEO_SECRET",
    );
    const other = fileNamed("Inferences.json", "OTHER_SECRET");
    const pastText = vi.spyOn(pastYear, "text");
    const videoText = vi.spyOn(video, "text");
    const otherText = vi.spyOn(other, "text");

    const result = await readFiles([pastYear, video, other]);

    expect(pastText).not.toHaveBeenCalled();
    expect(videoText).not.toHaveBeenCalled();
    expect(otherText).not.toHaveBeenCalled();
    expect(result.audioFiles).toEqual([]);
    expect(result.pastYearOnly).toBe(true);
    expect(result.fileErrors).toEqual([
      {
        fileName: "StreamingHistory0.json",
        message: PAST_YEAR_EXPORT_MESSAGE,
      },
    ]);
    expect(result.warnings).toEqual([
      { kind: "ignoredVideoFiles", count: 1 },
      { kind: "ignoredOtherFiles", count: 1 },
      { kind: "unsupportedPastYearFiles", count: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("PAST_YEAR_SECRET");
    expect(JSON.stringify(result)).not.toContain("VIDEO_SECRET");
    expect(JSON.stringify(result)).not.toContain("OTHER_SECRET");
  });

  // A mixed drop still loads the extended file. The past-year file is only a warning.
  // Input: endsong_0.json with an empty list, plus StreamingHistory_music_0.json.
  // Expected: one audio file, no file errors, pastYearOnly false, and one unsupported-file warning.
  it("loads extended files and warns when a past-year file is mixed in", async () => {
    const result = await readFiles([
      fileNamed("endsong_0.json", "[]"),
      fileNamed("StreamingHistory_music_0.json", "PAST_YEAR_SECRET"),
    ]);

    expect(result.pastYearOnly).toBe(false);
    expect(result.audioFiles).toHaveLength(1);
    expect(result.fileErrors).toEqual([]);
    expect(result.warnings).toEqual([
      { kind: "unsupportedPastYearFiles", count: 1 },
    ]);
  });

  // The PDF readme that ships with an export is not an error and not a warning.
  // Input: ReadMeFirst_ExtendedStreamingHistory.pdf.
  // Expected: no audio files, no errors, no warnings, and pastYearOnly false.
  it("ignores ordinary non-JSON files", async () => {
    const result = await readFiles([
      fileNamed("ReadMeFirst_ExtendedStreamingHistory.pdf", "%PDF"),
    ]);

    expect(result.audioFiles).toEqual([]);
    expect(result.fileErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.pastYearOnly).toBe(false);
  });

  // Empty and oversized files are rejected from their size, before their contents are read.
  // Input: an empty Streaming_History_Audio file, and an endsong file whose size is just over 500 MB.
  // Expected: text() is never called, no audio files, and one error for each file.
  it("rejects an empty file and a file over 500 MB without reading them", async () => {
    const empty = fileNamed("Streaming_History_Audio_1.json", "");
    const huge = fileNamed("endsong_0.json", "[]");
    Object.defineProperty(huge, "size", { value: MAX_FILE_BYTES + 1 });
    const emptyText = vi.spyOn(empty, "text");
    const hugeText = vi.spyOn(huge, "text");

    const result = await readFiles([empty, huge]);

    expect(emptyText).not.toHaveBeenCalled();
    expect(hugeText).not.toHaveBeenCalled();
    expect(result.audioFiles).toEqual([]);
    expect(result.fileErrors).toEqual([
      {
        fileName: "Streaming_History_Audio_1.json",
        message: "`Streaming_History_Audio_1.json` is empty.",
      },
      {
        fileName: "endsong_0.json",
        message: "`endsong_0.json` is larger than 500 MB and was skipped.",
      },
    ]);
  });

  // The same base name and size is one file. A different size is a different file.
  // Input: two copies of Streaming_History_Audio_1.json with body "[]", plus a third with a longer body.
  // Expected: two audio files (the empty list, then [{ n: 1 }]) and one duplicate-file warning.
  it("skips a duplicate base name and size, and keeps a different size", async () => {
    const first = fileNamed("Streaming_History_Audio_1.json", "[]");
    const duplicate = fileNamed("streaming_history_audio_1.json", "[]");
    const otherSize = fileNamed(
      "Streaming_History_Audio_1.json",
      JSON.stringify([{ n: 1 }]),
    );

    const result = await readFiles([first, duplicate, otherSize]);

    expect(result.audioFiles).toHaveLength(2);
    expect(result.audioFiles[0]?.rows).toEqual([]);
    expect(result.audioFiles[1]?.rows).toEqual([{ n: 1 }]);
    expect(result.warnings).toEqual([{ kind: "duplicateFiles", count: 1 }]);
  });

  // A folder upload keeps the real name on webkitRelativePath, not on file.name.
  // Input: a file named ignored.json whose relative path is Spotify/Streaming_History_Audio_2019.json and whose body is [].
  // Expected: one audio file named Streaming_History_Audio_2019.json.
  it("uses webkitRelativePath so a folder upload still classifies", async () => {
    const file = fileNamed("ignored.json", "[]");
    Object.defineProperty(file, "webkitRelativePath", {
      value: "Spotify/Streaming_History_Audio_2019.json",
    });

    const result = await readFiles([file]);

    expect(result.audioFiles.map((entry) => entry.fileName)).toEqual([
      "Streaming_History_Audio_2019.json",
    ]);
  });

  // Progress is reported after each JSON file, in the order the files were given.
  // Input: a video file, an extended-audio file, and Playlist1.json.
  // Expected: three updates, done 1 then 2 then 3, total 3, with those file names.
  it("reports progress after each classified file, in order", async () => {
    const progress: { done: number; total: number; fileName: string }[] = [];
    await readFiles(
      [
        fileNamed("Streaming_History_Video_1.json", "[]"),
        fileNamed("Streaming_History_Audio_1.json", "[]"),
        fileNamed("Playlist1.json", "{}"),
      ],
      (update) => progress.push(update),
    );

    expect(progress).toEqual([
      {
        done: 1,
        total: 3,
        fileName: "Streaming_History_Video_1.json",
      },
      {
        done: 2,
        total: 3,
        fileName: "Streaming_History_Audio_1.json",
      },
      { done: 3, total: 3, fileName: "Playlist1.json" },
    ]);
  });

  // A zip is unpacked, and only the extended-audio JSON inside it is parsed.
  // Input: export.zip with one audio file in a folder, a PDF, a __MACOSX copy, and Playlist1.json.
  // Expected: one audio file with that row, no errors, one ignored-other warning, and neither secret in the result.
  it("reads extended audio out of a zip and skips junk entries", async () => {
    const zipped = zipSync({
      "Export/Streaming_History_Audio_2019.json": strToU8(
        JSON.stringify([{ ts: "a" }]),
      ),
      "ReadMeFirst_ExtendedStreamingHistory.pdf": strToU8("%PDF"),
      "__MACOSX/Streaming_History_Audio_2019.json": strToU8("MAC_SECRET"),
      "Playlist1.json": strToU8("PLAYLIST_SECRET"),
    });

    const result = await readFiles([new File([zipped], "export.zip")]);

    expect(result.audioFiles).toEqual([
      {
        fileName: "Streaming_History_Audio_2019.json",
        size: JSON.stringify([{ ts: "a" }]).length,
        rows: [{ ts: "a" }],
      },
    ]);
    expect(result.fileErrors).toEqual([]);
    expect(result.warnings).toEqual([
      { kind: "ignoredOtherFiles", count: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("MAC_SECRET");
    expect(JSON.stringify(result)).not.toContain("PLAYLIST_SECRET");
  });

  // Dropping a file and a zip that contains that same file does not double the rows.
  // Input: Streaming_History_Audio_1.json with body "[]", then export.zip containing the same name and body.
  // Expected: one audio file and one duplicate-file warning.
  it("dedupes a loose file against the same file inside a zip", async () => {
    const body = "[]";
    const zipped = zipSync({
      "Streaming_History_Audio_1.json": strToU8(body),
    });

    const result = await readFiles([
      fileNamed("Streaming_History_Audio_1.json", body),
      new File([zipped], "export.zip"),
    ]);

    expect(result.audioFiles).toHaveLength(1);
    expect(result.warnings).toEqual([{ kind: "duplicateFiles", count: 1 }]);
  });

  // One bad zip does not stop the next file, and a zip inside a zip is skipped.
  // Input: bad.zip (not a zip), then outer.zip containing inner.zip plus Streaming_History_Audio_2.json.
  // Expected: an unzip error, a nested-zip error, and one audio file whose row is { ok: true }.
  it("continues after a corrupt zip and skips nested zips", async () => {
    const inner = zipSync({
      "Streaming_History_Audio_1.json": strToU8("[]"),
    });
    const outer = zipSync({
      "inner.zip": inner,
      "Streaming_History_Audio_2.json": strToU8('[{"ok":true}]'),
    });

    const result = await readFiles([
      new File([new Uint8Array([1, 2, 3, 4])], "bad.zip"),
      new File([outer], "outer.zip"),
    ]);

    expect(result.fileErrors).toEqual([
      { fileName: "bad.zip", message: "`bad.zip` could not be unzipped." },
      {
        fileName: "inner.zip",
        message: "`inner.zip` is a nested zip and was skipped.",
      },
    ]);
    expect(result.audioFiles.map((entry) => entry.rows)).toEqual([
      [{ ok: true }],
    ]);
  });

  // A BOM on a JSON entry inside a zip is stripped before parsing.
  // Input: export.zip whose only entry is Streaming_History_Audio_1.json, bytes EF BB BF followed by [].
  // Expected: no file errors, and one audio file with an empty row list.
  it("decodes a BOM-prefixed JSON entry inside a zip", async () => {
    const payload = strToU8("[]");
    const withBom = new Uint8Array(payload.length + 3);
    withBom.set([0xef, 0xbb, 0xbf]);
    withBom.set(payload, 3);
    const zipped = zipSync({
      "Streaming_History_Audio_1.json": withBom,
    });

    const result = await readFiles([new File([zipped], "export.zip")]);

    expect(result.fileErrors).toEqual([]);
    expect(result.audioFiles[0]?.rows).toEqual([]);
  });
});

describe("collectFiles", () => {
  // A file input hands over a FileList, which is already a flat list of files.
  // Input: a FileList holding Streaming_History_Audio_1.json.
  // Expected: that same file, unchanged.
  it("reads a FileList from a file input", async () => {
    const file = fileNamed("Streaming_History_Audio_1.json", "[]");

    const files = await collectFiles(fileList([file]));

    expect(files.map((entry) => entry.name)).toEqual([file.name]);
  });

  // A drop of ordinary files has no directory entries, so the file list is used.
  // Input: a DataTransfer whose only file is endsong_0.json.
  // Expected: that same file.
  it("reads a drop of plain files", async () => {
    const file = fileNamed("endsong_0.json", "[]");
    const transfer = {
      items: [{ kind: "file", getAsFile: () => file }],
      files: fileList([file]),
    } as unknown as DataTransfer;

    const files = await collectFiles(transfer);

    expect(files.map((entry) => entry.name)).toEqual([file.name]);
  });

  // A dropped folder is walked through webkitGetAsEntry, one batch of entries at a time.
  // Input: a directory that returns one file, then a second file, then an empty batch.
  // Expected: readEntries is called three times, and both files come back in that order.
  it("walks a dropped directory, including batched readEntries", async () => {
    const first = fileNamed("Streaming_History_Audio_1.json", "[]");
    const second = fileNamed("endsong_0.json", "[]");
    const children = [fileEntry(first), fileEntry(second)];
    let calls = 0;
    const directory = {
      isFile: false,
      isDirectory: true,
      name: "export",
      fullPath: "/export",
      createReader: () => ({
        readEntries: (success: (entries: FileSystemEntry[]) => void) => {
          calls += 1;
          if (calls === 1) success([children[0]]);
          else if (calls === 2) success([children[1]]);
          else success([]);
        },
      }),
    } as FileSystemDirectoryEntry;

    const transfer = {
      items: [
        {
          kind: "file",
          webkitGetAsEntry: () => directory,
          getAsFile: () => null,
        },
      ],
      files: [] as unknown as FileList,
    } as unknown as DataTransfer;

    const files = await collectFiles(transfer);

    expect(calls).toBe(3);
    expect(files.map((entry) => entry.name)).toEqual([
      "Streaming_History_Audio_1.json",
      "endsong_0.json",
    ]);
  });
});

/**
 * This jsdom build's Blob has no text() or arrayBuffer(). Browsers do.
 * FileReader is the fallback those methods are specified in terms of.
 */
function installBlobReaders(): void {
  const blobPrototype = Blob.prototype as Blob & {
    text?: () => Promise<string>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof blobPrototype.text !== "function") {
    blobPrototype.text = function text(this: Blob) {
      return readBlob(this, "text") as Promise<string>;
    };
  }
  if (typeof blobPrototype.arrayBuffer !== "function") {
    blobPrototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return readBlob(this, "arrayBuffer") as Promise<ArrayBuffer>;
    };
  }
}

function readBlob(
  blob: Blob,
  mode: "text" | "arrayBuffer",
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result == null) reject(new Error("empty read"));
      else resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    if (mode === "text") reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });
}

function fileList(files: File[]): FileList {
  const list = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    *[Symbol.iterator]() {
      yield* files;
    },
  } as FileList;
  files.forEach((file, index) => {
    (list as unknown as Record<number, File>)[index] = file;
  });
  return list;
}

function fileEntry(file: File): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    fullPath: `/${file.name}`,
    file: (success) => {
      success(file);
    },
  } as FileSystemFileEntry;
}
