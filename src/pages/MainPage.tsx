/**
 * Home page. The upload controls arrive in a later pass. Save and Forget
 * are here once a dataset is loaded.
 */

import { useEffect } from "react";
import { NOTHING_SAVED_MESSAGE } from "@/state/datasetReducer";
import { useDataset } from "@/state/useDataset";
import pageStyles from "./Page.module.css";
import styles from "./MainPage.module.css";

const VISIT_HINT =
  "This stays in this tab. A refresh brings it back. Closing the tab forgets it.";
const SAVED_HINT = "Saved on this browser.";

/** Sets the document title and renders the home page. */
export function MainPage() {
  const {
    isReady,
    durable,
    saving,
    writesSkipped,
    storageError,
    nothingSaved,
    save,
    clearSaved,
  } = useDataset();

  useEffect(() => {
    document.title = "Spotify Data";
  }, []);

  return (
    <div>
      <h1 className={pageStyles.title}>Main</h1>
      {storageError ? (
        <p className={styles.alert} role="alert">
          {storageError}
        </p>
      ) : null}
      {isReady ? (
        <div className={styles.visit}>
          <p className={styles.note}>{durable ? SAVED_HINT : VISIT_HINT}</p>
          <div className={styles.actions}>
            {durable ? null : (
              <button
                type="button"
                className={styles.button}
                onClick={save}
                disabled={saving || writesSkipped}
              >
                {saving ? "Saving…" : "Save on this browser"}
              </button>
            )}
            <button
              type="button"
              className={styles.button}
              onClick={clearSaved}
              disabled={saving}
            >
              Forget this data
            </button>
          </div>
        </div>
      ) : null}
      {nothingSaved ? <p className={styles.note}>{NOTHING_SAVED_MESSAGE}</p> : null}
    </div>
  );
}
