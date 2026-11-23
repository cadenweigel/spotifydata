/**
 * Placeholder for /analysis. What this page shows is still undecided.
 */

import { useEffect } from "react";
import styles from "./Page.module.css";

/** Sets the document title and renders the page heading. */
export function AnalysisPage() {
  useEffect(() => {
    document.title = "Analysis · Spotify Data";
  }, []);

  return <h1 className={styles.title}>Analysis</h1>;
}
