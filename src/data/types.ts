/**
 * Shapes shared by the whole app. Pages import these and never read Spotify's
 * original keys. Nothing here loads or parses files.
 */

/** One play from an extended streaming history export. Primitive fields only. */
export type Stream = {
  /** Dense index assigned at ingest, stable for this load. */
  id: number;
  /** ISO-8601 UTC. When the stream ended. */
  endedAt: string;
  msPlayed: number;
  /** Empty string when the export has no artist. */
  artist: string;
  album: string | null;
  track: string;
  trackUri: string | null;
  isPodcast: boolean;
  /** Coarse platform bucket. */
  platform: string | null;
  country: string | null;
  reasonStart: string | null;
  reasonEnd: string | null;
  shuffle: boolean | null;
  skipped: boolean | null;
  offline: boolean | null;
  incognito: boolean | null;
};

/** Counts and date range for one loaded export. */
export type DatasetMeta = {
  /** All rows, including under-threshold plays and podcasts. */
  streamCount: number;
  musicCount: number;
  podcastCount: number;
  ignoredVideoFiles: number;
  minEndedAt: string | null;
  maxEndedAt: string | null;
  /** Base names of files that contributed at least one stream. */
  sourceFiles: string[];
};

/** The normalized listening history after a successful upload. */
export type Dataset = {
  meta: DatasetMeta;
  /** Sorted by endedAt ascending. */
  streams: Stream[];
};

/** One file that could not be used, named by its base name. */
export type FileError = {
  fileName: string;
  message: string;
};

/** A counted problem that did not stop the rest of the upload. */
export type IngestWarning =
  | { kind: "rejectedRows"; count: number; fileName: string }
  | { kind: "clampedTimes"; count: number; fileName: string }
  | { kind: "ignoredVideoFiles"; count: number }
  | { kind: "ignoredOtherFiles"; count: number }
  | { kind: "unsupportedPastYearFiles"; count: number }
  | { kind: "duplicateFiles"; count: number };

/** What an upload produces: a dataset, or null when nothing usable was found. */
export type IngestResult = {
  /** Null when nothing usable was found. */
  dataset: Dataset | null;
  fileErrors: FileError[];
  warnings: IngestWarning[];
};

/** Which table the Data page is showing. */
export type EntityKind = "artist" | "album" | "track";

/** How entity rows are ordered. Rank is assigned after this sort, not stored. */
export type SortKey =
  | "streams"
  | "listenTime"
  | "firstStream"
  | "lastStream"
  | "alpha";

/** One artist, album, or track after grouping. Computed from streams, not saved. */
export type EntityRow = {
  /** Grouping key. */
  key: string;
  /** Primary label. */
  name: string;
  /** Artist on album and track rows. Null for artists. */
  subtitle: string | null;
  streams: number;
  listenTimeMs: number;
  /** ISO-8601 UTC. */
  firstStream: string;
  /** ISO-8601 UTC. */
  lastStream: string;
  /** Set for artists and albums. */
  trackCount: number | null;
  /** Set for artists. */
  albumCount: number | null;
  /** Known skips divided by rows where skipped is known. Null if none are known. */
  skipRate: number | null;
};
