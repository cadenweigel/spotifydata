/**
 * Tests for normalizeRow and normalizeFiles. Rows are synthetic and include
 * sentinel privacy values that must not survive onto a Stream.
 */

import { describe, expect, it } from "vitest";
import { normalizeFiles, normalizeRow } from "./normalize";

const SENTINEL_USER = "SENTINEL_USER";
const SENTINEL_IP = "SENTINEL_IP";
const SENTINEL_UA = "SENTINEL_UA";

describe("normalizeRow", () => {
  // Maps a full extended music row and leaves private fields behind.
  // Input: the sample music object, plus username, IP, user agent, and an extra key.
  // Expected: the Stream below, clamped false, and none of the sentinel strings.
  it("maps an extended music row and drops privacy fields", () => {
    const result = normalizeRow(
      {
        ts: "2014-07-27T20:34:47Z",
        username: SENTINEL_USER,
        platform: "Android OS 4.2.2 API 17 (samsung, GT-I9195)",
        ms_played: 35422,
        conn_country: "GB",
        ip_addr: SENTINEL_IP,
        ip_addr_decrypted: "SENTINEL_IP_DEC",
        user_agent_decrypted: SENTINEL_UA,
        master_metadata_track_name: "Communication Breakdown - Remaster",
        master_metadata_album_artist_name: "Led Zeppelin",
        master_metadata_album_album_name: "Led Zeppelin",
        spotify_track_uri: "spotify:track:2whQxHDxButA5STZ32FYme",
        episode_name: null,
        episode_show_name: null,
        spotify_episode_uri: null,
        reason_start: "appload",
        reason_end: "  endplay  ",
        shuffle: false,
        skipped: true,
        offline: false,
        offline_timestamp: 1_700_000_000,
        incognito_mode: false,
        unexpected_extra: "SENTINEL_EXTRA",
      },
      4,
    );

    expect(result).toEqual({
      ok: true,
      clamped: false,
      stream: {
        id: 4,
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
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SENTINEL_USER);
    expect(serialized).not.toContain(SENTINEL_IP);
    expect(serialized).not.toContain(SENTINEL_UA);
    expect(serialized).not.toContain("SENTINEL_EXTRA");
  });

  // A podcast uses the episode name and the show name.
  // Input: an episode row with null music metadata.
  // Expected: isPodcast true, artist is the show, track is the episode, album and URI null.
  it("maps an extended podcast row", () => {
    const result = normalizeRow(
      {
        ts: "2020-01-02T03:04:05Z",
        ms_played: 1000,
        platform: "iOS 14.4 (iPhone13,2)",
        episode_name: "Episode One",
        episode_show_name: "The Show",
        spotify_episode_uri: "spotify:episode:abc",
        master_metadata_track_name: null,
        master_metadata_album_artist_name: null,
        master_metadata_album_album_name: null,
        spotify_track_uri: null,
      },
      0,
    );

    expect(result).toEqual({
      ok: true,
      clamped: false,
      stream: {
        id: 0,
        endedAt: "2020-01-02T03:04:05.000Z",
        msPlayed: 1000,
        artist: "The Show",
        album: null,
        track: "Episode One",
        trackUri: null,
        isPodcast: true,
        platform: "iOS",
        country: null,
        reasonStart: null,
        reasonEnd: null,
        shuffle: null,
        skipped: null,
        offline: null,
        incognito: null,
      },
    });
  });

  // A show name with no track URI is a podcast even without an episode URI.
  // Input: episode name and show name, null track URI, null episode URI.
  // Expected: isPodcast true and the episode title kept.
  it("treats a show name and a missing track URI as a podcast", () => {
    const result = normalizeRow(
      {
        ts: "2020-01-02T03:04:05Z",
        ms_played: 1000,
        episode_name: "Morning",
        episode_show_name: "Daily",
        spotify_track_uri: null,
        spotify_episode_uri: null,
      },
      0,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stream.isPodcast).toBe(true);
    expect(result.stream.track).toBe("Morning");
    expect(result.stream.artist).toBe("Daily");
  });

  // Older rows leave skip and country unknown. Those stay unknown.
  // Input: a track with skipped null, country ZZ, blank reasons, and no booleans.
  // Expected: null for skipped, country, reasons, and the other booleans. Artist is "".
  it("keeps unknown booleans null and drops ZZ country", () => {
    const result = normalizeRow(
      {
        ts: "2020-05-01T12:00:00Z",
        ms_played: 50_000,
        master_metadata_track_name: "  Local   Song ",
        master_metadata_album_artist_name: null,
        conn_country: "zz",
        reason_start: "   ",
        reason_end: 12,
        skipped: null,
        platform: null,
      },
      1,
    );

    expect(result).toEqual({
      ok: true,
      clamped: false,
      stream: {
        id: 1,
        endedAt: "2020-05-01T12:00:00.000Z",
        msPlayed: 50_000,
        artist: "",
        album: null,
        track: "Local Song",
        trackUri: null,
        isPodcast: false,
        platform: null,
        country: null,
        reasonStart: null,
        reasonEnd: null,
        shuffle: null,
        skipped: null,
        offline: null,
        incognito: null,
      },
    });
  });

  // A negative play time is stored as zero and flagged, not skipped.
  // Input: ms_played -1500 and a track name.
  // Expected: ok, msPlayed 0, clamped true.
  it("clamps a negative play time to zero", () => {
    const result = normalizeRow(
      {
        ts: "2019-03-01T00:00:00Z",
        ms_played: -1500,
        master_metadata_track_name: "Song",
        master_metadata_album_artist_name: "Artist",
      },
      0,
    );

    expect(result).toEqual({
      ok: true,
      clamped: true,
      stream: expect.objectContaining({ msPlayed: 0, track: "Song" }),
    });
  });

  // Zero is a real play time. It is not a clamp and not a skip.
  // Input: ms_played 0.
  // Expected: ok, msPlayed 0, clamped false.
  it("keeps a zero play time", () => {
    const result = normalizeRow(
      {
        ts: "2019-03-01T00:00:00Z",
        ms_played: 0,
        master_metadata_track_name: "Song",
      },
      0,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clamped).toBe(false);
    expect(result.stream.msPlayed).toBe(0);
  });

  // Missing, string, and non-finite play times are skipped.
  // Input: no ms_played, "10", and Infinity, each with a track name.
  // Expected: missingMsPlayed for each.
  it("rejects a play time that is missing or not a finite number", () => {
    const base = {
      ts: "2019-03-01T00:00:00Z",
      master_metadata_track_name: "Song",
    };
    expect(normalizeRow(base, 0)).toEqual({
      ok: false,
      reason: "missingMsPlayed",
    });
    expect(normalizeRow({ ...base, ms_played: "10" }, 0)).toEqual({
      ok: false,
      reason: "missingMsPlayed",
    });
    expect(normalizeRow({ ...base, ms_played: Infinity }, 0)).toEqual({
      ok: false,
      reason: "missingMsPlayed",
    });
  });

  // A row with neither title is skipped.
  // Input: null track name and null episode name.
  // Expected: missingName.
  it("rejects a row with no track name and no episode name", () => {
    expect(
      normalizeRow(
        {
          ts: "2019-03-01T00:00:00Z",
          ms_played: 1000,
          master_metadata_track_name: null,
          episode_name: "  ",
        },
        0,
      ),
    ).toEqual({ ok: false, reason: "missingName" });
  });

  // A bad or missing end time is skipped before the other fields matter.
  // Input: "not-a-date", a blank string, a number, and a non-object.
  // Expected: invalidTimestamp for each.
  it("rejects an unparseable timestamp", () => {
    const base = { ms_played: 1000, master_metadata_track_name: "Song" };
    expect(normalizeRow({ ...base, ts: "not-a-date" }, 0)).toEqual({
      ok: false,
      reason: "invalidTimestamp",
    });
    expect(normalizeRow({ ...base, ts: "  " }, 0)).toEqual({
      ok: false,
      reason: "invalidTimestamp",
    });
    expect(normalizeRow({ ...base, ts: 1_400_000_000_000 }, 0)).toEqual({
      ok: false,
      reason: "invalidTimestamp",
    });
    expect(normalizeRow(null, 0)).toEqual({
      ok: false,
      reason: "invalidTimestamp",
    });
  });

  // Empty and ZZ countries are unknown. A real code is kept as written.
  // Input: "", "ZZ", " zz ", and "us".
  // Expected: null, null, null, and "us".
  it("maps country codes", () => {
    const base = {
      ts: "2019-03-01T00:00:00Z",
      ms_played: 1000,
      master_metadata_track_name: "Song",
    };
    for (const conn_country of ["", "ZZ", " zz "]) {
      const result = normalizeRow({ ...base, conn_country }, 0);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.stream.country).toBeNull();
    }
    const kept = normalizeRow({ ...base, conn_country: "us" }, 0);
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.stream.country).toBe("us");
  });
});

describe("normalizeFiles", () => {
  // Sorts by end time, breaks ties by read order, and assigns dense ids.
  // Also counts skips per file and per reason, and counts clamped times.
  // Input: two files. The first has an early row, a negative later row, and a
  // missing play time. The second repeats the early timestamp, then a nameless
  // row and a bad timestamp.
  // Expected: three streams in time order with ids 0, 1, 2, and the counts below.
  it("sorts streams, assigns ids, and counts skips and clamps per file", () => {
    const early = {
      ts: "2018-01-01T00:00:00Z",
      ms_played: 40_000,
      master_metadata_track_name: "First",
      master_metadata_album_artist_name: "A",
    };
    const result = normalizeFiles([
      {
        fileName: "Streaming_History_Audio_2018.json",
        rows: [
          early,
          {
            ts: "2019-06-01T00:00:00Z",
            ms_played: -20,
            master_metadata_track_name: "Later",
            master_metadata_album_artist_name: "A",
          },
          {
            ts: "2019-07-01T00:00:00Z",
            master_metadata_track_name: "No Time",
          },
        ],
      },
      {
        fileName: "Streaming_History_Audio_2019.json",
        rows: [
          {
            ...early,
            master_metadata_track_name: "Tied",
          },
          {
            ts: "2019-08-01T00:00:00Z",
            ms_played: 1000,
            master_metadata_track_name: null,
            episode_name: null,
          },
          {
            ts: "yesterday",
            ms_played: 1000,
            master_metadata_track_name: "Bad Date",
          },
        ],
      },
    ]);

    expect(
      result.streams.map((stream) => [stream.id, stream.track, stream.msPlayed]),
    ).toEqual([
      [0, "First", 40_000],
      [1, "Tied", 40_000],
      [2, "Later", 0],
    ]);
    expect(result.streams.map((stream) => stream.endedAt)).toEqual([
      "2018-01-01T00:00:00.000Z",
      "2018-01-01T00:00:00.000Z",
      "2019-06-01T00:00:00.000Z",
    ]);
    expect(result.files).toEqual([
      {
        fileName: "Streaming_History_Audio_2018.json",
        rejected: 1,
        rejectedByReason: {
          invalidTimestamp: 0,
          missingMsPlayed: 1,
          missingName: 0,
        },
        clamped: 1,
      },
      {
        fileName: "Streaming_History_Audio_2019.json",
        rejected: 2,
        rejectedByReason: {
          invalidTimestamp: 1,
          missingMsPlayed: 0,
          missingName: 1,
        },
        clamped: 0,
      },
    ]);
  });

  // An empty upload produces an empty list and no file counts.
  // Input: no files.
  // Expected: no streams and no file entries.
  it("returns nothing for no files", () => {
    expect(normalizeFiles([])).toEqual({ streams: [], files: [] });
  });
});
