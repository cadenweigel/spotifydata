/**
 * Tests for classifyFile. Each case passes a file name and expects one of
 * extendedAudio, video, pastYearUnsupported, or other.
 */

import { describe, expect, it } from "vitest";
import { classifyFile } from "./classifyFile";

describe("classifyFile", () => {
  // Classifies the two extended-audio name patterns.
  // Input: "Streaming_History_Audio_2019.json" and "endsong_0.json".
  // Expected: both return "extendedAudio".
  it("recognizes extended audio names, including the older endsong prefix", () => {
    expect(classifyFile("Streaming_History_Audio_2019.json")).toBe(
      "extendedAudio",
    );
    expect(classifyFile("endsong_0.json")).toBe("extendedAudio");
  });

  // Classifies a video history file, which the app counts and skips.
  // Input: "Streaming_History_Video_2020.json".
  // Expected: "video".
  it("recognizes video history", () => {
    expect(classifyFile("Streaming_History_Video_2020.json")).toBe("video");
  });

  // Classifies every past-year filename pattern, including the numbered form.
  // Input: music, podcast, StreamingHistory0.json, and StreamingHistory12.json.
  // Expected: each returns "pastYearUnsupported".
  it("recognizes each past-year name", () => {
    expect(classifyFile("StreamingHistory_music_0.json")).toBe(
      "pastYearUnsupported",
    );
    expect(classifyFile("StreamingHistory_podcast_1.json")).toBe(
      "pastYearUnsupported",
    );
    expect(classifyFile("StreamingHistory0.json")).toBe("pastYearUnsupported");
    expect(classifyFile("StreamingHistory12.json")).toBe("pastYearUnsupported");
  });

  // Leaves account files that are not streaming history unclassified as history.
  // Input: a playlist, Inferences, Identity, and a name that only contains the audio prefix.
  // Expected: each returns "other".
  it("treats playlists and other account files as other", () => {
    expect(classifyFile("Playlist1.json")).toBe("other");
    expect(classifyFile("Inferences.json")).toBe("other");
    expect(classifyFile("Identity.json")).toBe("other");
    expect(classifyFile("not_streaming_history_audio_1.json")).toBe("other");
  });

  // Classification uses the file name, not the folder, and ignores capitalization.
  // Input: a nested path, a Windows path, and two mixed-case names.
  // Expected: extended audio, video, extended audio, and past-year, in that order.
  it("matches the base name only, and ignores case", () => {
    expect(
      classifyFile("Export/Nested/Streaming_History_Audio_2020.json"),
    ).toBe("extendedAudio");
    expect(
      classifyFile("C:\\Users\\me\\Export\\Streaming_History_Video_1.json"),
    ).toBe("video");
    expect(classifyFile("EnDsOnG_2.JSON")).toBe("extendedAudio");
    expect(classifyFile("STREAMINGHISTORY_MUSIC_0.JSON")).toBe(
      "pastYearUnsupported",
    );
  });
});
