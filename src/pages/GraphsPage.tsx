/**
 * The Graphs page. Presets and controls edit the query string.
 * The chart only receives the query. It does not read the URL.
 */

import { useEffect } from "react";
import { GraphChart } from "@/components/graphs/GraphChart";
import { GraphControls } from "@/components/graphs/GraphControls";
import pageStyles from "./Page.module.css";
import styles from "./GraphsPage.module.css";
import { useGraphQueryParams } from "./useGraphQueryParams";

/** Sets the document title and renders the controls and the chart. */
export function GraphsPage() {
  const model = useGraphQueryParams();

  useEffect(() => {
    document.title = "Graphs · Spotify Data";
  }, []);

  return (
    <div className={styles.page}>
      <h1 className={pageStyles.title}>Graphs</h1>
      <GraphControls
        query={model.query}
        selectedPresetId={model.selectedPresetId}
        searchFocus={model.searchFocus}
        onQuery={model.setQuery}
      />
      <GraphChart query={model.query} />
    </div>
  );
}
