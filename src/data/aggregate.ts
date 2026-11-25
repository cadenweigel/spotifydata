/**
 * Turns a stream list into table rows. No React.
 * filterStreams applies the listen settings. groupEntities folds the
 * remaining rows into artists, albums, or tracks.
 * Dates in the filter are the user's local calendar days, compared to
 * endedAt as epoch milliseconds. Grouping compares endedAt as ISO strings.
 */

import type { EntityKind, EntityRow, Stream } from "@/data/types";
import { cleanName } from "./names";

/** Settings for one filter pass. */
export type StreamFilter = {
  /** Drop plays shorter than this. 0 keeps every length. */
  thresholdMs: number;
  /** When false, podcast rows are left out. */
  includePodcasts: boolean;
  /** Inclusive local day, YYYY-MM-DD. Null means no start. */
  from: string | null;
  /** Inclusive local day, YYYY-MM-DD. Null means no end. */
  to: string | null;
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Keeps streams that pass the threshold, the podcast setting, and the date range.
 * Input is the stream list (usually sorted by endedAt) and the filter settings.
 * `from` and `to` are inclusive calendar days in the user's local timezone.
 * "2024-03-05" runs from local midnight through the last millisecond of that day.
 * Null on either side leaves that side open. If `from` is after `to`, the
 * result is empty. The input order and the stream objects are preserved.
 */
export function filterStreams(streams: readonly Stream[], filter: StreamFilter): Stream[] {
  const { thresholdMs, includePodcasts, from, to } = filter;
  if (from !== null && to !== null && from > to) return [];

  const fromMs = from === null ? null : localDayStartMs(from);
  const toMs = to === null ? null : localDayEndMs(to);
  const kept: Stream[] = [];

  for (const stream of streams) {
    if (stream.isPodcast && !includePodcasts) continue;
    if (stream.msPlayed < thresholdMs) continue;
    if (fromMs !== null || toMs !== null) {
      const endedMs = Date.parse(stream.endedAt);
      if (fromMs !== null && !(endedMs >= fromMs)) continue;
      if (toMs !== null && !(endedMs <= toMs)) continue;
    }
    kept.push(stream);
  }

  return kept;
}

/**
 * Epoch ms at local midnight of a YYYY-MM-DD day.
 * The date is read as the user's timezone, not as UTC midnight.
 */
function localDayStartMs(isoDate: string): number {
  const { year, month, day } = parseDay(isoDate);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

/**
 * Epoch ms at the last millisecond of a YYYY-MM-DD day, in the user's timezone.
 */
function localDayEndMs(isoDate: string): number {
  const { year, month, day } = parseDay(isoDate);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

/** Reads a real YYYY-MM-DD calendar day. */
function parseDay(isoDate: string): { year: number; month: number; day: number } {
  const match = DAY.exec(isoDate);
  if (!match) {
    throw new Error(`filterStreams expected YYYY-MM-DD, received "${isoDate}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    throw new Error(`filterStreams expected a real calendar date, received "${isoDate}"`);
  }
  return { year, month, day };
}

/**
 * Distinct tracks, stored as the pieces of the track key.
 * A URI is one track. Without one, the lowercase track name is the key,
 * and the album is included when the play has one, so two editions stay
 * apart. The pieces are kept separate so a repeated play does not build
 * a new joined string. Null for track rows, which do not count tracks.
 */
type TrackCounter = {
  uris: Set<string>;
  /** Lowercase track names from plays with a null album. */
  noAlbum: Set<string>;
  /** Lowercase track name to the lowercase album names paired with it. */
  withAlbum: Map<string, Set<string>>;
};

/** Running totals for one artist, album, or track. */
type Accumulator = {
  streams: number;
  listenTimeMs: number;
  /** ISO-8601 UTC. The earliest endedAt seen. */
  firstStream: string;
  /** ISO-8601 UTC. The latest endedAt seen. */
  lastStream: string;
  /** Display-name casing and how many plays used it. */
  nameCounts: Map<string, number>;
  /** Subtitle casing counts. Null for artists, which have no subtitle. */
  subtitleCounts: Map<string, number> | null;
  tracks: TrackCounter | null;
  /**
   * Lowercase album names. Within one artist the album key is that
   * artist's key plus the album name, so the name keeps them distinct.
   * Null except on artist rows.
   */
  albums: Set<string> | null;
  skippedCount: number;
  /** Plays where skipped is true or false. Null skipped is left out. */
  knownSkipCount: number;
};

/**
 * Folds streams into one row per artist, album, or track.
 * Input is the stream list and the kind of row to build. The list does
 * not have to be sorted. Album grouping skips a play with a null album.
 * A blank artist shares the key "" and is shown as "Unknown artist".
 * Returns one row per group, in the order each group was first seen.
 * Play count, listen time, and the first and last dates cover that group.
 */
export function groupEntities(streams: readonly Stream[], kind: EntityKind): EntityRow[] {
  if (kind === "artist") return groupArtists(streams);
  if (kind === "album") return groupAlbums(streams);
  return groupTracks(streams);
}

/** One pass that builds an artist row for each lowercase artist name. */
function groupArtists(streams: readonly Stream[]): EntityRow[] {
  const groups = new Map<string, Accumulator>();
  const lowercase = createLowercase();

  for (const stream of streams) {
    const artistName = cleanName(stream.artist);
    const acc = takeGroup(groups, lowercase(artistName), stream.endedAt, "artist");
    addCommon(acc, stream);
    bump(acc.nameCounts, artistName);
    const albumKey = albumKeyPart(stream, lowercase);
    noteTrack(acc.tracks, stream, lowercase, albumKey);
    if (albumKey !== null && acc.albums !== null) acc.albums.add(albumKey);
  }

  return finish(groups, "artist");
}

/**
 * One pass that builds an album row for each artist plus album.
 * Plays with a null album are skipped.
 */
function groupAlbums(streams: readonly Stream[]): EntityRow[] {
  const groups = new Map<string, Accumulator>();
  const lowercase = createLowercase();

  for (const stream of streams) {
    if (stream.album === null) continue;
    const artistName = cleanName(stream.artist);
    const albumName = cleanName(stream.album);
    const key = `${lowercase(artistName)}\u0000${lowercase(albumName)}`;
    const acc = takeGroup(groups, key, stream.endedAt, "album");
    addCommon(acc, stream);
    bump(acc.nameCounts, albumName);
    bumpSubtitle(acc, artistLabel(artistName));
    noteTrack(acc.tracks, stream, lowercase, lowercase(albumName));
  }

  return finish(groups, "album");
}

/**
 * One pass that builds a track row.
 * The key is the track URI when the play has one. Otherwise it is the
 * lowercase artist and track, plus the album when the play has one.
 */
function groupTracks(streams: readonly Stream[]): EntityRow[] {
  const groups = new Map<string, Accumulator>();
  const lowercase = createLowercase();

  for (const stream of streams) {
    const artistName = cleanName(stream.artist);
    const trackName = cleanName(stream.track);
    const albumName = stream.album === null ? null : cleanName(stream.album);
    const artistKey = lowercase(artistName);
    const trackKey = lowercase(trackName);
    const key = stream.trackUri
      ? stream.trackUri
      : albumName === null
        ? `${artistKey}\u0000${trackKey}`
        : `${artistKey}\u0000${trackKey}\u0000${lowercase(albumName)}`;
    const acc = takeGroup(groups, key, stream.endedAt, "track");
    addCommon(acc, stream);
    bump(acc.nameCounts, trackName);
    bumpSubtitle(acc, trackSubtitle(artistName, albumName));
  }

  return finish(groups, "track");
}

/** Lowercase album name, or null when the play has no album. */
function albumKeyPart(stream: Stream, lowercase: (value: string) => string): string | null {
  if (stream.album === null) return null;
  return lowercase(cleanName(stream.album));
}

/**
 * Records one track on an artist or album row.
 * A URI stands alone. A named track keeps its album when it has one,
 * using "" for a blank album title so that stays distinct from a null album.
 */
function noteTrack(
  tracks: TrackCounter | null,
  stream: Stream,
  lowercase: (value: string) => string,
  albumKey: string | null,
): void {
  if (tracks === null) return;
  if (stream.trackUri) {
    tracks.uris.add(stream.trackUri);
    return;
  }
  const trackKey = lowercase(cleanName(stream.track));
  if (albumKey === null) {
    tracks.noAlbum.add(trackKey);
    return;
  }
  let albums = tracks.withAlbum.get(trackKey);
  if (albums === undefined) {
    albums = new Set();
    tracks.withAlbum.set(trackKey, albums);
  }
  albums.add(albumKey);
}

/** Shown for a blank artist. The grouping key stays "". */
function artistLabel(name: string): string {
  return name === "" ? "Unknown artist" : name;
}

/** Subtitle for a track: the artist, and the album when the play has one. */
function trackSubtitle(artistName: string, albumName: string | null): string {
  const artist = artistLabel(artistName);
  if (albumName === null || albumName === "") return artist;
  return `${artist} \u2014 ${albumName}`;
}

/**
 * Remembers lowercase forms for the names in this pass.
 * The same cleaned spelling is reused, so repeated plays do not call
 * toLowerCase again.
 */
function createLowercase(): (value: string) => string {
  const cache = new Map<string, string>();
  return (value) => {
    const cached = cache.get(value);
    if (cached !== undefined) return cached;
    const next = value.toLowerCase();
    cache.set(value, next);
    return next;
  };
}

/** The group for this key, created on the first play. */
function takeGroup(
  groups: Map<string, Accumulator>,
  key: string,
  endedAt: string,
  kind: EntityKind,
): Accumulator {
  let acc = groups.get(key);
  if (acc === undefined) {
    acc = createAccumulator(endedAt, kind);
    groups.set(key, acc);
  }
  return acc;
}

/** Empty totals. Track and album sets are created only for the kinds that read them. */
function createAccumulator(endedAt: string, kind: EntityKind): Accumulator {
  return {
    streams: 0,
    listenTimeMs: 0,
    firstStream: endedAt,
    lastStream: endedAt,
    nameCounts: new Map(),
    subtitleCounts: kind === "artist" ? null : new Map(),
    tracks:
      kind === "track"
        ? null
        : { uris: new Set(), noAlbum: new Set(), withAlbum: new Map() },
    albums: kind === "artist" ? new Set() : null,
    skippedCount: 0,
    knownSkipCount: 0,
  };
}

/** Adds the play's time, dates, and skip flag. Dates are compared, not assumed to be sorted. */
function addCommon(acc: Accumulator, stream: Stream): void {
  acc.streams += 1;
  acc.listenTimeMs += stream.msPlayed;
  if (stream.endedAt < acc.firstStream) acc.firstStream = stream.endedAt;
  if (stream.endedAt > acc.lastStream) acc.lastStream = stream.endedAt;
  if (stream.skipped !== null) {
    acc.knownSkipCount += 1;
    if (stream.skipped) acc.skippedCount += 1;
  }
}

function bumpSubtitle(acc: Accumulator, subtitle: string): void {
  if (acc.subtitleCounts !== null) bump(acc.subtitleCounts, subtitle);
}

function bump(counts: Map<string, number>, value: string): void {
  const current = counts.get(value);
  counts.set(value, current === undefined ? 1 : current + 1);
}

/**
 * The casing that appeared most often.
 * Input is a count per casing, inserted in the order each casing was first
 * seen. Ties keep the earlier one. Returns "" when the map is empty.
 */
function mostFrequent(counts: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Known skips divided by plays where skipped is known.
 * A null skipped is unknown, not a play that was heard through, so those
 * rows stay out of both counts. Dividing by every stream would treat older
 * rows as not skipped. The result is null when no play in the group is known.
 */
function knownSkipRate(skippedCount: number, knownSkipCount: number): number | null {
  if (knownSkipCount === 0) return null;
  return skippedCount / knownSkipCount;
}

/** Distinct albums, or null when this kind has no album set or none were known. */
function countAlbums(keys: Set<string> | null): number | null {
  if (keys === null || keys.size === 0) return null;
  return keys.size;
}

/** Distinct tracks, or null when this kind does not count them. */
function countTracks(tracks: TrackCounter | null): number | null {
  if (tracks === null) return null;
  let total = tracks.uris.size + tracks.noAlbum.size;
  for (const albums of tracks.withAlbum.values()) total += albums.size;
  return total;
}

/** Rows in the order each group was first seen. */
function finish(groups: Map<string, Accumulator>, kind: EntityKind): EntityRow[] {
  const rows: EntityRow[] = [];
  for (const [key, acc] of groups) rows.push(toRow(key, acc, kind));
  return rows;
}

/** One finished row. Artist names that are blank become "Unknown artist". */
function toRow(key: string, acc: Accumulator, kind: EntityKind): EntityRow {
  const casing = mostFrequent(acc.nameCounts);
  return {
    key,
    name: kind === "artist" ? artistLabel(casing) : casing,
    subtitle: acc.subtitleCounts === null ? null : mostFrequent(acc.subtitleCounts),
    streams: acc.streams,
    listenTimeMs: acc.listenTimeMs,
    firstStream: acc.firstStream,
    lastStream: acc.lastStream,
    trackCount: countTracks(acc.tracks),
    albumCount: countAlbums(acc.albums),
    skipRate: knownSkipRate(acc.skippedCount, acc.knownSkipCount),
  };
}
