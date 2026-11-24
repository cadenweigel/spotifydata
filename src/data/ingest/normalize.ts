/**
 * Maps extended-audio rows into Stream values.
 * normalizeRow handles one Spotify object. normalizeFiles handles every
 * parsed file, counts the rows it skips, sorts by end time, and assigns ids.
 * Only the fields read below are kept. Username, IP, and user agent are never copied.
 */

import type { Stream } from "@/data/types";
import { cleanName } from "@/data/names";
import { bucketPlatform } from "./platform";

/** Why a row was skipped. A row is counted under the first reason that applies. */
export type RejectReason = "invalidTimestamp" | "missingMsPlayed" | "missingName";

/** One row, either a stream or the reason it was skipped. */
export type NormalizeRowResult =
  | { ok: true; stream: Stream; clamped: boolean }
  | { ok: false; reason: RejectReason };

/** One extended-audio file: the base name and the parsed JSON array. */
export type AudioFileRows = {
  fileName: string;
  rows: readonly unknown[];
};

/** How many rows one file skipped or clamped. */
export type FileNormalizeCounts = {
  fileName: string;
  rejected: number;
  rejectedByReason: Record<RejectReason, number>;
  /** Rows that were kept with a negative ms_played stored as 0. */
  clamped: number;
};

/** Sorted streams, plus per-file skip and clamp counts. */
export type NormalizeFilesResult = {
  /** Sorted by endedAt, then by the order the rows were read. id is the index. */
  streams: Stream[];
  files: FileNormalizeCounts[];
};

type PendingStream = {
  stream: Stream;
  readOrder: number;
};

/**
 * Maps one extended-audio row into a Stream.
 * Input is the raw object and the id to stamp on it. A non-object is rejected.
 * Returns the stream, and whether a negative play time was stored as 0,
 * or the reason the row was skipped. This does not throw.
 */
export function normalizeRow(row: unknown, id: number): NormalizeRowResult {
  // A list, a string, or null has no fields to read. Treat it as a bad timestamp.
  if (!isRecord(row)) return { ok: false, reason: "invalidTimestamp" };

  const endedAt = mapEndedAt(row.ts);
  if (endedAt === null) return { ok: false, reason: "invalidTimestamp" };

  const rawMs = readMsPlayed(row.ms_played);
  if (rawMs === null) return { ok: false, reason: "missingMsPlayed" };

  const musicTitle = displayName(row.master_metadata_track_name);
  const episodeTitle = displayName(row.episode_name);
  const podcast = isPodcast(row);
  const track = chooseTrack(podcast, musicTitle, episodeTitle);
  // A row with no track name and no episode name has nothing to show.
  if (track === null) return { ok: false, reason: "missingName" };

  const artistSource = podcast
    ? row.episode_show_name
    : row.master_metadata_album_artist_name;
  // Negative play time is kept as zero. The caller counts that clamp.
  const clamped = rawMs < 0;

  return {
    ok: true,
    clamped,
    stream: {
      id,
      endedAt,
      msPlayed: clamped ? 0 : rawMs,
      artist: displayName(artistSource),
      album: optionalName(row.master_metadata_album_album_name),
      track,
      trackUri: optionalText(row.spotify_track_uri),
      isPodcast: podcast,
      platform: bucketPlatform(row.platform),
      country: mapCountry(row.conn_country),
      reasonStart: optionalText(row.reason_start),
      reasonEnd: optionalText(row.reason_end),
      shuffle: mapBoolean(row.shuffle),
      skipped: mapBoolean(row.skipped),
      offline: mapBoolean(row.offline),
      incognito: mapBoolean(row.incognito_mode),
    },
  };
}

/**
 * Maps every extended-audio file into one stream list.
 * Input is the files from readFiles, in the order they were read.
 * Rows that fail are counted per file and per reason. Negative play times are
 * counted per file and stored as 0. Streams are sorted by endedAt, keeping
 * read order when two end at the same time, then given ids 0, 1, 2, and so on.
 */
export function normalizeFiles(
  files: readonly AudioFileRows[],
): NormalizeFilesResult {
  const pending: PendingStream[] = [];
  const counts: FileNormalizeCounts[] = [];
  let readOrder = 0;

  for (const file of files) {
    const rejectedByReason = emptyReasons();
    let rejected = 0;
    let clamped = 0;

    for (const row of file.rows) {
      // The id passed here is temporary. The sort below replaces it.
      const result = normalizeRow(row, 0);
      if (!result.ok) {
        rejected += 1;
        rejectedByReason[result.reason] += 1;
        continue;
      }
      if (result.clamped) clamped += 1;
      pending.push({ stream: result.stream, readOrder });
      readOrder += 1;
    }

    counts.push({
      fileName: file.fileName,
      rejected,
      rejectedByReason,
      clamped,
    });
  }

  pending.sort((a, b) => {
    if (a.stream.endedAt < b.stream.endedAt) return -1;
    if (a.stream.endedAt > b.stream.endedAt) return 1;
    return a.readOrder - b.readOrder;
  });

  const streams = pending.map((entry, id) => ({ ...entry.stream, id }));
  return { streams, files: counts };
}

/**
 * True when the value is a plain object.
 * Arrays and null are not rows. Input is the unchecked JSON value.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when a Spotify field carries a usable string.
 * Null, non-strings, and blank strings all count as missing.
 */
function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * A row is a podcast when it has an episode name or an episode URI,
 * or when it has a show name and no track URI. Everything else is music.
 */
function isPodcast(row: Record<string, unknown>): boolean {
  if (hasText(row.episode_name)) return true;
  if (hasText(row.spotify_episode_uri)) return true;
  return !hasText(row.spotify_track_uri) && hasText(row.episode_show_name);
}

/**
 * Picks the title to store.
 * Podcasts prefer the episode name and music prefers the track name.
 * If that preferred name is blank but the other one is present, the other one
 * is used, so a row is dropped only when both names are blank.
 * Returns null when both are blank.
 */
function chooseTrack(
  podcast: boolean,
  musicTitle: string,
  episodeTitle: string,
): string | null {
  const preferred = podcast ? episodeTitle : musicTitle;
  if (preferred !== "") return preferred;
  const other = podcast ? musicTitle : episodeTitle;
  return other === "" ? null : other;
}

/**
 * Parses `ts` into the UTC ISO string stored on a stream.
 * Input is the raw field. It must be a string Date can parse.
 * `2014-07-27T20:34:47Z` becomes `2014-07-27T20:34:47.000Z`.
 * Returns null when the field is missing or not a real date.
 */
function mapEndedAt(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Reads `ms_played`.
 * Input is the raw field. Returns the number when it is finite, including negatives.
 * Returns null when it is missing, a string, or not finite.
 */
function readMsPlayed(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Cleans a name for display.
 * Input is a raw field. Non-strings and blank strings become "".
 */
function displayName(value: unknown): string {
  if (typeof value !== "string") return "";
  return cleanName(value);
}

/**
 * Cleans a name that is stored as null when missing.
 * Input is the album field. A blank name becomes null.
 */
function optionalName(value: unknown): string | null {
  const name = displayName(value);
  return name === "" ? null : name;
}

/**
 * Trims a short string field such as a URI or a reason.
 * Input is the raw field. Blank and non-strings become null.
 * Internal spaces are left as they are.
 */
function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

/**
 * Maps `conn_country`.
 * Input is the raw field. Empty strings and `ZZ` (any case) become null.
 * Any other text is trimmed and kept.
 */
function mapCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const country = value.trim();
  if (country === "" || country.toUpperCase() === "ZZ") return null;
  return country;
}

/**
 * Maps a Spotify boolean that is often missing on older rows.
 * Input is the raw field. Returns true, false, or null. Never undefined.
 */
function mapBoolean(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/** A zero count for each skip reason. */
function emptyReasons(): Record<RejectReason, number> {
  return {
    invalidTimestamp: 0,
    missingMsPlayed: 0,
    missingName: 0,
  };
}
