import { useEffect } from "react";
import styles from "./Page.module.css";

export function MainPage() {
  useEffect(() => {
    document.title = "Spotify Data";
  }, []);

  return <h1 className={styles.title}>Main</h1>;
}
