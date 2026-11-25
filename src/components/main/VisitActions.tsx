/**
 * Save and Forget for the dataset on screen.
 * Children are extra actions in the same row, such as Replace data.
 */

import type { ReactNode } from "react";
import { useDataset } from "@/state/useDataset";
import styles from "./VisitActions.module.css";

const VISIT_HINT =
  "This stays in this tab. A refresh brings it back. Closing the tab forgets it.";
const SAVED_HINT = "Saved on this browser.";

type VisitActionsProps = {
  children?: ReactNode;
};

/**
 * Renders the visit sentence and the save controls.
 * Input is optional extra buttons, placed before Save and Forget.
 * Returns nothing while a dataset is not ready, including during a parse.
 */
export function VisitActions({ children }: VisitActionsProps) {
  const { isReady, durable, saving, writesSkipped, save, clearSaved } = useDataset();
  if (!isReady) return null;

  return (
    <div className={styles.visit}>
      <p className={styles.note}>{durable ? SAVED_HINT : VISIT_HINT}</p>
      <div className={styles.actions}>
        {children}
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
        <button type="button" className={styles.button} onClick={clearSaved} disabled={saving}>
          Forget this data
        </button>
      </div>
    </div>
  );
}
