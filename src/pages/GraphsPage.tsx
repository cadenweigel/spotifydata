import { useEffect } from "react";
import styles from "./Page.module.css";

export function GraphsPage() {
  useEffect(() => {
    document.title = "Graphs · Spotify Data";
  }, []);

  return <h1 className={styles.title}>Graphs</h1>;
}
