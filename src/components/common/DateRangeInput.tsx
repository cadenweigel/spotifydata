/**
 * Two date inputs for a from/to range.
 * Data and Graphs both use this. An inverted range is shown and not applied.
 */

import { useEffect, useState } from "react";
import styles from "./DateRangeInput.module.css";

type DateRangeInputProps = {
  from: string;
  to: string;
  /** Earliest day the inputs accept, YYYY-MM-DD. Empty means no limit. */
  min?: string;
  /** Latest day the inputs accept, YYYY-MM-DD. Empty means no limit. */
  max?: string;
  showReset: boolean;
  onChange: (from: string, to: string) => void;
  onReset: () => void;
};

/**
 * Renders From, To, and Reset dates when the range is not the full one.
 * Input is the applied days, the dataset limits, and the two callbacks.
 * A start after the end shows a message and leaves the applied range as it was.
 */
export function DateRangeInput({
  from,
  to,
  min,
  max,
  showReset,
  onChange,
  onReset,
}: DateRangeInputProps) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  // Reset and Back change the applied days. Copy them into the inputs
  // after render, so a keystroke is not overwritten while it is in flight.
  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  const inverted = draftFrom !== "" && draftTo !== "" && draftFrom > draftTo;

  const commit = (nextFrom: string, nextTo: string) => {
    if (nextFrom === "" || nextTo === "") return;
    if (nextFrom > nextTo) return;
    onChange(nextFrom, nextTo);
  };

  return (
    <fieldset className={styles.range}>
      <legend className={styles.legend}>Date range</legend>
      <label className={styles.field}>
        From
        <input
          className={styles.input}
          type="date"
          value={draftFrom}
          min={min || undefined}
          max={max || undefined}
          onChange={(event) => {
            const next = event.target.value;
            setDraftFrom(next);
            commit(next, draftTo);
          }}
        />
      </label>
      <label className={styles.field}>
        To
        <input
          className={styles.input}
          type="date"
          value={draftTo}
          min={min || undefined}
          max={max || undefined}
          onChange={(event) => {
            const next = event.target.value;
            setDraftTo(next);
            commit(draftFrom, next);
          }}
        />
      </label>
      {showReset ? (
        <button type="button" className={styles.reset} onClick={onReset}>
          Reset dates
        </button>
      ) : null}
      {inverted ? (
        <p className={styles.error} role="alert">
          Start date must be on or before the end date.
        </p>
      ) : null}
    </fieldset>
  );
}
