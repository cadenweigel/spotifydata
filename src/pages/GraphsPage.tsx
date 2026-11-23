/**
 * Placeholder for /graphs. Charts will replace this heading.
 */

import { useEffect } from "react";
import styles from "./Page.module.css";

/** Sets the document title and renders the page heading. */
export function GraphsPage() {
  useEffect(() => {
    document.title = "Graphs · Spotify Data";
  }, []);

  return <h1 className={styles.title}>Graphs</h1>;
}
