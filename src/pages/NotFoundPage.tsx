/**
 * Shown for any URL that is not a known route, with a link back to home.
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";
import styles from "./Page.module.css";

/** Sets the document title and offers a way back to the main page. */
export function NotFoundPage() {
  useEffect(() => {
    document.title = "Not found · Spotify Data";
  }, []);

  return (
    <div>
      <h1 className={styles.title}>Page not found</h1>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}
