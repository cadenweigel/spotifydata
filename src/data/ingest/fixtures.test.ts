/**
 * Tests that ingest the synthetic fixtures. Each fixture file uses a short
 * name on disk. The File handed to ingest uses a Spotify name, because
 * classification looks at that name: extended_audio.json is uploaded as
 * Streaming_History_Audio_2019.json, the video and past-year fixtures use
 * their history prefixes, and broken.json is named as extended audio so
 * the truncated text is actually parsed. not_history.json keeps its name.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DatasetMeta, Stream } from "@/data/types";
import { ingest } from "./ingest";
import { PAST_YEAR_EXPORT_MESSAGE } from "./readFiles";

const AUDIO_NAME = "Streaming_History_Audio_2019.json";
const VIDEO_NAME = "Streaming_History_Video_2019.json";
const PAST_YEAR_NAME = "StreamingHistory_music_0.json";
const BROKEN_NAME = "Streaming_History_Audio_broken.json";
const OTHER_NAME = "not_history.json";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
);

const audioMeta: DatasetMeta = {
  streamCount: 8,
  musicCount: 7,
  podcastCount: 1,
  ignoredVideoFiles: 0,
  minEndedAt: "2014-07-27T20:34:47.000Z",
  maxEndedAt: "2022-12-31T23:59:59.000Z",
  sourceFiles: [AUDIO_NAME],
};

const audioStreams: Stream[] = [
  {
    id: 0,
    endedAt: "2014-07-27T20:34:47.000Z",
    msPlayed: 35422,
    artist: "Led Zeppelin",
    album: "Led Zeppelin",
    track: "Communication Breakdown - Remaster",
    trackUri: "spotify:track:2whQxHDxButA5STZ32FYme",
    isPodcast: false,
    platform: "Android",
    country: "GB",
    reasonStart: "appload",
    reasonEnd: "endplay",
    shuffle: false,
    skipped: true,
    offline: false,
    incognito: false,
  },
  {
    id: 1,
    endedAt: "2015-05-05T05:05:05.000Z",
    msPlayed: 8000,
    artist: "Early Artist",
    album: "Early Album",
    track: "Early Song",
    trackUri: "spotify:track:early",
    isPodcast: false,
    platform: "Linux",
    country: "FR",
    reasonStart: "appload",
    reasonEnd: "trackdone",
    shuffle: false,
    skipped: false,
    offline: false,
    incognito: false,
  },
  {
    id: 2,
    endedAt: "2017-02-14T00:00:00.000Z",
    msPlayed: 25000,
    artist: "Cast Artist",
    album: "Cast Album",
    track: "Cast Tune",
    trackUri: "spotify:track:cast",
    isPodcast: false,
    platform: "Other device",
    country: null,
    reasonStart: null,
    reasonEnd: null,
    shuffle: false,
    skipped: null,
    offline: false,
    incognito: false,
  },
  {
    id: 3,
    endedAt: "2018-04-04T08:00:00.000Z",
    msPlayed: 12000,
    artist: "Local Artist",
    album: null,
    track: "Bedroom Demo",
    trackUri: null,
    isPodcast: false,
    platform: "macOS",
    country: null,
    reasonStart: null,
    reasonEnd: null,
    shuffle: false,
    skipped: false,
    offline: true,
    incognito: false,
  },
  {
    id: 4,
    endedAt: "2019-06-15T12:00:00.000Z",
    msPlayed: 30000,
    artist: "Mid Artist",
    album: "Mid Album",
    track: "Mid Song",
    trackUri: "spotify:track:mid",
    isPodcast: false,
    platform: "Windows",
    country: "US",
    reasonStart: "clickrow",
    reasonEnd: "trackdone",
    shuffle: null,
    skipped: null,
    offline: false,
    incognito: false,
  },
  {
    id: 5,
    endedAt: "2020-01-02T03:04:05.000Z",
    msPlayed: 61000,
    artist: "The Show",
    album: null,
    track: "Episode One",
    isPodcast: true,
    trackUri: null,
    platform: "iOS",
    country: null,
    reasonStart: null,
    reasonEnd: null,
    shuffle: false,
    skipped: false,
    offline: false,
    incognito: false,
  },
  {
    id: 6,
    endedAt: "2021-09-09T18:30:00.000Z",
    msPlayed: 40000,
    artist: "Web Artist",
    album: "Web Album",
    track: "Web Hit",
    trackUri: "spotify:track:web",
    isPodcast: false,
    platform: "Web Player",
    country: "DE",
    reasonStart: "clickrow",
    reasonEnd: "trackdone",
    shuffle: true,
    skipped: false,
    offline: false,
    incognito: false,
  },
  {
    id: 7,
    endedAt: "2022-12-31T23:59:59.000Z",
    msPlayed: 5000,
    artist: "Latest Artist",
    album: "Latest Album",
    track: "Latest",
    trackUri: "spotify:track:latest",
    isPodcast: false,
    platform: null,
    country: "SE",
    reasonStart: "playbtn",
    reasonEnd: "endplay",
    shuffle: true,
    skipped: false,
    offline: true,
    incognito: true,
  },
];

beforeAll(() => {
  installBlobReaders();
});

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

function fixtureFile(fixtureName: string, uploadName: string): File {
  return new File([readFixture(fixtureName)], uploadName);
}

function audioFile(): File {
  return fixtureFile("extended_audio.json", AUDIO_NAME);
}

function videoFile(): File {
  return fixtureFile("extended_video.json", VIDEO_NAME);
}

function pastYearFile(): File {
  return fixtureFile("past_year_music.json", PAST_YEAR_NAME);
}

function brokenFile(): File {
  return fixtureFile("broken.json", BROKEN_NAME);
}

function otherFile(): File {
  return fixtureFile("not_history.json", OTHER_NAME);
}

function expectNoFixtureSecrets(serialized: string): void {
  expect(serialized).not.toContain("SENTINEL_USER");
  expect(serialized).not.toContain("SENTINEL_IP");
  expect(serialized).not.toContain("SENTINEL_UA");
  expect(serialized).not.toContain("SENTINEL_OFFLINE");
  expect(serialized).not.toContain("VIDEO_SENTINEL");
  expect(serialized).not.toContain("PAST_YEAR_SENTINEL");
  expect(serialized).not.toContain("BROKEN_SENTINEL");
  expect(serialized).not.toContain("PLAYLIST_SENTINEL");
}

describe("ingest fixtures", () => {
  // The extended fixture is eight plays: music, a podcast, a local file, and a null skip.
  // Input: extended_audio.json uploaded under an extended-audio name.
  // Expected: eight sorted streams, the summary below, and no errors or warnings.
  it("loads the extended audio fixture", async () => {
    const result = await ingest([audioFile()]);

    expect(result.fileErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.dataset?.meta).toEqual(audioMeta);
    expect(result.dataset?.streams).toEqual(audioStreams);
    expectNoFixtureSecrets(JSON.stringify(result));
  });

  // Video history is counted and never opened.
  // Input: extended_video.json uploaded under a video-history name.
  // Expected: no dataset, one ignored-video warning, and the body is not read.
  it("counts the video fixture and adds no streams", async () => {
    const text = vi.spyOn(Blob.prototype, "text");
    try {
      const result = await ingest([videoFile()]);

      expect(result).toEqual({
        dataset: null,
        fileErrors: [],
        warnings: [{ kind: "ignoredVideoFiles", count: 1 }],
      });
      expect(text).not.toHaveBeenCalled();
      expectNoFixtureSecrets(JSON.stringify(result));
    } finally {
      text.mockRestore();
    }
  });

  // The past-year fixture is recognized and left unread.
  // Input: past_year_music.json uploaded under a past-year music name.
  // Expected: no dataset, the past-year file error, and one unsupported warning.
  it("rejects the past-year fixture without reading it", async () => {
    const text = vi.spyOn(Blob.prototype, "text");
    try {
      const result = await ingest([pastYearFile()]);

      expect(result.dataset).toBeNull();
      expect(result.fileErrors).toEqual([
        { fileName: PAST_YEAR_NAME, message: PAST_YEAR_EXPORT_MESSAGE },
      ]);
      expect(result.warnings).toEqual([
        { kind: "unsupportedPastYearFiles", count: 1 },
      ]);
      expect(text).not.toHaveBeenCalled();
      expectNoFixtureSecrets(JSON.stringify(result));
    } finally {
      text.mockRestore();
    }
  });

  // A playlist object is other JSON. It is counted and not parsed.
  // Input: not_history.json under its own name.
  // Expected: no dataset, one ignored-other warning, and the body is not read.
  it("counts the playlist fixture as other JSON", async () => {
    const text = vi.spyOn(Blob.prototype, "text");
    try {
      const result = await ingest([otherFile()]);

      expect(result).toEqual({
        dataset: null,
        fileErrors: [],
        warnings: [{ kind: "ignoredOtherFiles", count: 1 }],
      });
      expect(text).not.toHaveBeenCalled();
      expectNoFixtureSecrets(JSON.stringify(result));
    } finally {
      text.mockRestore();
    }
  });

  // Truncated JSON is a file error and does not throw.
  // Input: broken.json uploaded under an extended-audio name.
  // Expected: no dataset, a "not valid JSON" error, and the body absent from the message.
  it("reports the broken fixture as invalid JSON", async () => {
    const result = await ingest([brokenFile()]);

    expect(result.dataset).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.fileErrors).toEqual([
      {
        fileName: BROKEN_NAME,
        message: `\`${BROKEN_NAME}\` is not valid JSON.`,
      },
    ]);
    expectNoFixtureSecrets(JSON.stringify(result));
  });

  // Extended rows load, and the past-year file is only a warning.
  // Input: the extended fixture and the past-year fixture together.
  // Expected: the eight streams, one unsupported warning, and no past-year file error.
  it("loads extended audio and warns about the past-year fixture", async () => {
    const result = await ingest([audioFile(), pastYearFile()]);

    expect(result.fileErrors).toEqual([]);
    expect(result.dataset?.meta).toEqual(audioMeta);
    expect(result.dataset?.streams).toEqual(audioStreams);
    expect(result.warnings).toEqual([
      { kind: "unsupportedPastYearFiles", count: 1 },
    ]);
    expectNoFixtureSecrets(JSON.stringify(result));
  });

  // Video beside extended audio adds a count and no streams.
  // Input: the extended fixture and the video fixture.
  // Expected: the eight streams, ignoredVideoFiles 1 on the summary and as a warning.
  it("loads extended audio and counts the video fixture", async () => {
    const result = await ingest([audioFile(), videoFile()]);

    expect(result.fileErrors).toEqual([]);
    expect(result.dataset?.meta).toEqual({ ...audioMeta, ignoredVideoFiles: 1 });
    expect(result.dataset?.streams).toEqual(audioStreams);
    expect(result.warnings).toEqual([{ kind: "ignoredVideoFiles", count: 1 }]);
    expectNoFixtureSecrets(JSON.stringify(result));
  });

  // A playlist beside extended audio is an ignored-other warning.
  // Input: the extended fixture and not_history.json.
  // Expected: the eight streams and one ignored-other warning.
  it("loads extended audio and counts the playlist fixture", async () => {
    const result = await ingest([audioFile(), otherFile()]);

    expect(result.fileErrors).toEqual([]);
    expect(result.dataset?.meta).toEqual(audioMeta);
    expect(result.dataset?.streams).toEqual(audioStreams);
    expect(result.warnings).toEqual([{ kind: "ignoredOtherFiles", count: 1 }]);
    expectNoFixtureSecrets(JSON.stringify(result));
  });

  // One bad file does not drop the good extended file.
  // Input: the extended fixture, then broken.json under an extended-audio name.
  // Expected: the eight streams, and a file error that names the broken file.
  it("keeps the extended fixture when the broken fixture is included", async () => {
    const result = await ingest([audioFile(), brokenFile()]);

    expect(result.dataset?.meta).toEqual(audioMeta);
    expect(result.dataset?.streams).toEqual(audioStreams);
    expect(result.warnings).toEqual([]);
    expect(result.fileErrors).toEqual([
      {
        fileName: BROKEN_NAME,
        message: `\`${BROKEN_NAME}\` is not valid JSON.`,
      },
    ]);
    expectNoFixtureSecrets(JSON.stringify(result));
  });

  // Every fixture in one drop: the extended rows survive, and each other kind is reported.
  // Input: extended, broken, video, past-year, and playlist fixtures.
  // Expected: the eight streams, the broken-file error, and warnings for video,
  // other, and past-year.
  it("loads extended audio from a drop of every fixture", async () => {
    const result = await ingest([
      audioFile(),
      brokenFile(),
      videoFile(),
      pastYearFile(),
      otherFile(),
    ]);

    expect(result.dataset?.meta).toEqual({ ...audioMeta, ignoredVideoFiles: 1 });
    expect(result.dataset?.streams).toEqual(audioStreams);
    expect(result.fileErrors).toEqual([
      {
        fileName: BROKEN_NAME,
        message: `\`${BROKEN_NAME}\` is not valid JSON.`,
      },
    ]);
    expect(result.warnings).toEqual([
      { kind: "ignoredVideoFiles", count: 1 },
      { kind: "ignoredOtherFiles", count: 1 },
      { kind: "unsupportedPastYearFiles", count: 1 },
    ]);
    expectNoFixtureSecrets(JSON.stringify(result));
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
