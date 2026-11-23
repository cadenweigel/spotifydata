/**
 * Names a Spotify export file without opening it.
 * readFiles.ts uses the result to decide what to parse: only "extendedAudio"
 * is read. The other three kinds are counted and skipped.
 */

/** The four kinds of file an upload can contain. */
export type FileKind =
  | "extendedAudio"
  | "video"
  | "pastYearUnsupported"
  | "other";

/**
 * Returns the file name from a path.
 * Input can be a bare name, a folder path with "/", or a Windows path with "\".
 * The result is the last segment, so classification never sees the directory.
 */
export function baseName(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash === -1 ? path : path.slice(slash + 1);
}

/**
 * Decides which kind of Spotify file a name is, without opening the file.
 * Input is a file name or a path. Matching uses the base name only and ignores case.
 * Returns "extendedAudio" for lifetime history (the only kind that gets parsed),
 * "video" for video history, "pastYearUnsupported" for the shorter export,
 * and "other" for everything else, such as playlists or Identity.json.
 */
export function classifyFile(name: string): FileKind {
  const base = baseName(name);

  // Streaming_History_Audio_*.json, or the older endsong_*.json name.
  if (/^(streaming_history_audio_|endsong_)/i.test(base)) {
    return "extendedAudio";
  }
  // Streaming_History_Video_*.json. Counted, then skipped.
  if (/^streaming_history_video_/i.test(base)) {
    return "video";
  }
  // StreamingHistory_music_*.json, StreamingHistory_podcast_*.json,
  // or the older StreamingHistory0.json style.
  if (
    /^streaminghistory_(music|podcast)_/i.test(base) ||
    /^streaminghistory\d+\.json$/i.test(base)
  ) {
    return "pastYearUnsupported";
  }
  // Playlists, library, Wrapped, and any other account JSON.
  return "other";
}
