import { useEffect } from "react";
import { Link } from "react-router-dom";
import styles from "./Page.module.css";

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
