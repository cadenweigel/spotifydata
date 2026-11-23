/**
 * Placeholder for the home page. The upload UI will replace this heading.
 */

import { useEffect } from "react";
import styles from "./Page.module.css";

/** Sets the document title and renders the page heading. */
export function MainPage() {
  useEffect(() => {
    document.title = "Spotify Data";
  }, []);

  return <h1 className={styles.title}>Main</h1>;
}
