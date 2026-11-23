/**
 * Placeholder for /data/artists, /data/albums, and /data/songs.
 * The kind in the URL picks the heading. The table comes later.
 */

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import styles from "./Page.module.css";

const titles: Record<string, string> = {
  artists: "Artists",
  albums: "Albums",
  songs: "Songs",
};

/** Reads the :kind param and shows Artists, Albums, or Songs. */
export function DataPage() {
  const { kind = "artists" } = useParams<{ kind?: string }>();
  const label = titles[kind] ?? "Data";

  useEffect(() => {
    document.title = `${label} · Spotify Data`;
  }, [label]);

  return <h1 className={styles.title}>{label}</h1>;
}
