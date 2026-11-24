/**
 * Tests for ingest. Inputs are small synthetic files and zips, never a real
 * Spotify export. Each test notes its input and expected result.
 */

import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { PAST_YEAR_EXPORT_MESSAGE } from "./readFiles";
import { ingest } from "./ingest";

const SENTINEL_USER = "SENTINEL_USER";
const SENTINEL_IP = "SENTINEL_IP";
const SENTINEL_UA = "SENTINEL_UA";

beforeAll(() => {
  installBlobReaders();
});

function fileNamed(name: string, contents: string): File {
  return new File([contents], name);
}

function musicRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: "2019-01-01T00:00:00Z",
    ms_played: 30_000,
    master_metadata_track_name: "Song",
    master_metadata_album_artist_name: "Artist",
    username: SENTINEL_USER,
    ip_addr: SENTINEL_IP,
    user_agent_decrypted: SENTINEL_UA,
    ...overrides,
  };
}

describe("ingest", () => {
  // One extended file becomes a dataset. Private fields stay out of it.
  // Input: one music row and one podcast row, with sentinel username, IP, and user agent.
  // Expected: two streams in time order, the counts and range below, and no warnings.
  it("builds a dataset from one extended audio file", async () => {
    const result = await ingest([
      fileNamed(
        "Streaming_History_Audio_2019.json",
        JSON.stringify([
          musicRow({
            ts: "2020-01-02T03:04:05Z",
            master_metadata_track_name: "Later",
          }),
          musicRow({
            ts: "2014-07-27T20:34:47Z",
            ms_played: 60_000,
            master_metadata_track_name: null,
            episode_name: "The Episode",
            episode_show_name: "The Show",
            spotify_episode_uri: "spotify:episode:abc",
          }),
        ]),
      ),
    ]);

    expect(result.fileErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.dataset?.meta).toEqual({
      streamCount: 2,
      musicCount: 1,
      podcastCount: 1,
      ignoredVideoFiles: 0,
      minEndedAt: "2014-07-27T20:34:47.000Z",
      maxEndedAt: "2020-01-02T03:04:05.000Z",
      sourceFiles: ["Streaming_History_Audio_2019.json"],
    });
    expect(
      result.dataset?.streams.map((stream) => [
        stream.id,
        stream.track,
        stream.isPodcast,
      ]),
    ).toEqual([
      [0, "The Episode", true],
      [1, "Later", false],
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SENTINEL_USER);
    expect(serialized).not.toContain(SENTINEL_IP);
    expect(serialized).not.toContain(SENTINEL_UA);
  });

  // Skipped files are counted. A file that kept no row is not a source file.
  // Input: one audio file with a kept row, a clamped row, and a skipped row;
  // a second audio file whose only row has a bad timestamp; plus video, other, and past-year JSON.
  // Expected: two music streams from the first file, and the warnings below, in that order.
  it("counts skipped files and rows and omits a file that kept nothing", async () => {
    const result = await ingest([
      fileNamed(
        "Streaming_History_Audio_2018.json",
        JSON.stringify([
          musicRow({
            ts: "2018-01-01T00:00:00Z",
            ms_played: 1000,
            master_metadata_track_name: "Kept",
          }),
          musicRow({
            ts: "2018-06-01T00:00:00Z",
            ms_played: -10,
            master_metadata_track_name: "Clamped",
          }),
          musicRow({
            ts: "2018-07-01T00:00:00Z",
            ms_played: "nope",
            master_metadata_track_name: "Skipped",
          }),
        ]),
      ),
      fileNamed(
        "Streaming_History_Audio_2019.json",
        JSON.stringify([
          musicRow({ ts: "yesterday", master_metadata_track_name: "Bad Date" }),
        ]),
      ),
      fileNamed("Streaming_History_Video_2019.json", "VIDEO_SECRET"),
      fileNamed("Identity.json", "OTHER_SECRET"),
      fileNamed("StreamingHistory0.json", "PAST_SECRET"),
    ]);

    expect(result.fileErrors).toEqual([]);
    expect(result.dataset?.meta).toEqual({
      streamCount: 2,
      musicCount: 2,
      podcastCount: 0,
      ignoredVideoFiles: 1,
      minEndedAt: "2018-01-01T00:00:00.000Z",
      maxEndedAt: "2018-06-01T00:00:00.000Z",
      sourceFiles: ["Streaming_History_Audio_2018.json"],
    });
    expect(result.dataset?.streams.map((stream) => [stream.track, stream.msPlayed])).toEqual([
      ["Kept", 1000],
      ["Clamped", 0],
    ]);
    expect(result.warnings).toEqual([
      {
        kind: "rejectedRows",
        count: 1,
        fileName: "Streaming_History_Audio_2018.json",
      },
      {
        kind: "rejectedRows",
        count: 1,
        fileName: "Streaming_History_Audio_2019.json",
      },
      {
        kind: "clampedTimes",
        count: 1,
        fileName: "Streaming_History_Audio_2018.json",
      },
      { kind: "ignoredVideoFiles", count: 1 },
      { kind: "ignoredOtherFiles", count: 1 },
      { kind: "unsupportedPastYearFiles", count: 1 },
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("VIDEO_SECRET");
    expect(serialized).not.toContain("OTHER_SECRET");
    expect(serialized).not.toContain("PAST_SECRET");
  });

  // A file of only bad rows produces warnings and no dataset.
  // Input: one extended file whose row has no timestamp.
  // Expected: dataset null, one rejectedRows warning, and no file error.
  it("returns no dataset when every row is rejected", async () => {
    const result = await ingest([
      fileNamed(
        "Streaming_History_Audio_2019.json",
        JSON.stringify([musicRow({ ts: "not-a-date" })]),
      ),
    ]);

    expect(result.dataset).toBeNull();
    expect(result.fileErrors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        kind: "rejectedRows",
        count: 1,
        fileName: "Streaming_History_Audio_2019.json",
      },
    ]);
  });

  // An empty JSON array is valid and contributes nothing.
  // Input: Streaming_History_Audio_2019.json containing [].
  // Expected: dataset null, no errors, and no warnings.
  it("returns no dataset for an empty extended-audio list", async () => {
    const result = await ingest([
      fileNamed("Streaming_History_Audio_2019.json", "[]"),
    ]);

    expect(result).toEqual({ dataset: null, fileErrors: [], warnings: [] });
  });

  // The shorter export is named in a file error and adds no streams.
  // Input: StreamingHistory_music_0.json only.
  // Expected: dataset null, the past-year message, and one unsupportedPastYearFiles warning.
  it("returns no dataset and the past-year error when that is the only history", async () => {
    const result = await ingest([
      fileNamed(
        "StreamingHistory_music_0.json",
        JSON.stringify([{ endTime: "2019", trackName: "Song" }]),
      ),
    ]);

    expect(result.dataset).toBeNull();
    expect(result.fileErrors).toEqual([
      {
        fileName: "StreamingHistory_music_0.json",
        message: PAST_YEAR_EXPORT_MESSAGE,
      },
    ]);
    expect(result.warnings).toEqual([
      { kind: "unsupportedPastYearFiles", count: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("trackName");
  });

  // Video history is a warning, not a dataset and not a file error.
  // Input: one video JSON file.
  // Expected: dataset null and one ignoredVideoFiles warning.
  it("returns no dataset for a video file", async () => {
    const result = await ingest([
      fileNamed("Streaming_History_Video_2019.json", "[]"),
    ]);

    expect(result.dataset).toBeNull();
    expect(result.fileErrors).toEqual([]);
    expect(result.warnings).toEqual([{ kind: "ignoredVideoFiles", count: 1 }]);
  });

  // Nothing uploaded is an empty result, not an error.
  // Input: no files.
  // Expected: dataset null, no errors, and no warnings.
  it("returns no dataset for an empty upload", async () => {
    expect(await ingest([])).toEqual({
      dataset: null,
      fileErrors: [],
      warnings: [],
    });
  });

  // The same base name and size is one copy. The warning carries the count.
  // Input: Streaming_History_Audio_2019.json twice, with the same body.
  // Expected: one stream and one duplicateFiles warning.
  it("skips a second copy of the same file", async () => {
    const body = JSON.stringify([musicRow({ master_metadata_track_name: "Once" })]);
    const result = await ingest([
      fileNamed("Streaming_History_Audio_2019.json", body),
      fileNamed("Streaming_History_Audio_2019.json", body),
    ]);

    expect(result.dataset?.meta.streamCount).toBe(1);
    expect(result.dataset?.meta.sourceFiles).toEqual([
      "Streaming_History_Audio_2019.json",
    ]);
    expect(result.dataset?.streams.map((stream) => stream.track)).toEqual([
      "Once",
    ]);
    expect(result.warnings).toEqual([{ kind: "duplicateFiles", count: 1 }]);
  });

  // Different names are both kept, even when the rows are the same.
  // Input: two extended files with different names and the same play.
  // Expected: two streams, both names in sourceFiles, and no duplicate warning.
  it("keeps overlapping rows when the file names differ", async () => {
    const body = JSON.stringify([
      musicRow({ ts: "2019-03-01T00:00:00Z", master_metadata_track_name: "Same" }),
    ]);
    const result = await ingest([
      fileNamed("Streaming_History_Audio_2019.json", body),
      fileNamed("Streaming_History_Audio_2019_copy.json", body),
    ]);

    expect(result.dataset?.meta.streamCount).toBe(2);
    expect(result.dataset?.meta.sourceFiles).toEqual([
      "Streaming_History_Audio_2019.json",
      "Streaming_History_Audio_2019_copy.json",
    ]);
    expect(result.dataset?.streams.map((stream) => stream.id)).toEqual([0, 1]);
    expect(result.warnings).toEqual([]);
  });

  // Bad JSON is a file error. The message does not quote the file.
  // Input: an extended file whose text is not JSON and contains a sentinel.
  // Expected: dataset null, the "not valid JSON" error, and the sentinel absent.
  it("reports invalid JSON as a file error", async () => {
    const result = await ingest([
      fileNamed(
        "Streaming_History_Audio_2019.json",
        "SENTINEL_ROW_SECRET {",
      ),
    ]);

    expect(result.dataset).toBeNull();
    expect(result.fileErrors).toEqual([
      {
        fileName: "Streaming_History_Audio_2019.json",
        message: "`Streaming_History_Audio_2019.json` is not valid JSON.",
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("SENTINEL_ROW_SECRET");
  });

  // Progress follows the JSON files readFiles walks, in upload order.
  // Input: one extended file, one video file, and one other JSON file.
  // Expected: three progress calls, done 1 through 3 of 3, with those base names.
  it("reports progress for each JSON file", async () => {
    const progress: { done: number; total: number; fileName: string }[] = [];
    await ingest(
      [
        fileNamed("Streaming_History_Audio_2019.json", "[]"),
        fileNamed("Streaming_History_Video_1.json", "[]"),
        fileNamed("Playlist1.json", "{}"),
      ],
      (update) => progress.push(update),
    );

    expect(progress).toEqual([
      { done: 1, total: 3, fileName: "Streaming_History_Audio_2019.json" },
      { done: 2, total: 3, fileName: "Streaming_History_Video_1.json" },
      { done: 3, total: 3, fileName: "Playlist1.json" },
    ]);
  });

  // A zip contributes the audio file inside it, under that file's base name.
  // Input: export.zip with one audio file in a folder, a PDF, and Playlist1.json.
  // Expected: sourceFiles is the audio base name. The folder path, the zip name,
  // and the playlist body are absent.
  it("uses the base name of an audio file inside a zip", async () => {
    const zipped = zipSync({
      "Export/Streaming_History_Audio_2019.json": strToU8(
        JSON.stringify([musicRow({ master_metadata_track_name: "From Zip" })]),
      ),
      "ReadMeFirst_ExtendedStreamingHistory.pdf": strToU8("%PDF"),
      "Playlist1.json": strToU8("PLAYLIST_SECRET"),
    });

    const result = await ingest([new File([zipped], "export.zip")]);

    expect(result.fileErrors).toEqual([]);
    expect(result.dataset?.meta.sourceFiles).toEqual([
      "Streaming_History_Audio_2019.json",
    ]);
    expect(result.dataset?.streams.map((stream) => stream.track)).toEqual([
      "From Zip",
    ]);
    expect(result.warnings).toEqual([{ kind: "ignoredOtherFiles", count: 1 }]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Export/");
    expect(serialized).not.toContain("export.zip");
    expect(serialized).not.toContain("PLAYLIST_SECRET");
    expect(serialized).not.toContain(SENTINEL_USER);
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
