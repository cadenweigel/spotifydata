import { useEffect } from "react";
import styles from "./Page.module.css";

export function AnalysisPage() {
  useEffect(() => {
    document.title = "Analysis · Spotify Data";
  }, []);

  return <h1 className={styles.title}>Analysis</h1>;
}
