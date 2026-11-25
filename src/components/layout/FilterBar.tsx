/**
 * Listen time and podcast controls. They write the UI preferences.
 * The bar is the place a custom number of seconds is entered.
 */

import { useEffect, useState, type ChangeEvent } from "react";
import {
  MAX_THRESHOLD_MS,
  THRESHOLD_PRESETS,
  isPresetThreshold,
} from "@/state/prefsStorage";
import { useDataset } from "@/state/useDataset";
import { usePrefs } from "@/state/usePrefs";
import styles from "./FilterBar.module.css";

const MAX_SECONDS = MAX_THRESHOLD_MS / 1000;

/**
 * Renders the listen-time choices, the custom seconds field, and the podcast checkbox.
 * Input is none. The preferences and the loaded dataset come from the providers.
 * A custom value is a whole number of seconds, up to 24 hours.
 */
export function FilterBar() {
  const [prefs, setPrefs] = usePrefs();
  const { meta } = useDataset();
  const thresholdMs = prefs.streamThresholdMs;
  const [choosingCustom, setChoosingCustom] = useState(() => !isPresetThreshold(thresholdMs));
  const [draft, setDraft] = useState(() => String(thresholdMs / 1000));
  const showCustom = choosingCustom || !isPresetThreshold(thresholdMs);
  const noPodcasts = meta !== null && meta.podcastCount === 0;

  useEffect(() => {
    setDraft(String(thresholdMs / 1000));
    if (isPresetThreshold(thresholdMs)) setChoosingCustom(false);
  }, [thresholdMs]);

  const onSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    if (event.target.value === "custom") {
      setChoosingCustom(true);
      setDraft(String(thresholdMs / 1000));
      return;
    }
    setChoosingCustom(false);
    setPrefs({ streamThresholdMs: Number(event.target.value) });
  };

  const onSeconds = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setDraft(text);
    if (!/^\d+$/.test(text)) return;
    const seconds = Number(text);
    if (seconds > MAX_SECONDS) return;
    setPrefs({ streamThresholdMs: seconds * 1000 });
  };

  const onSecondsBlur = () => {
    if (!/^\d+$/.test(draft) || Number(draft) > MAX_SECONDS) {
      setDraft(String(thresholdMs / 1000));
    }
  };

  return (
    <div className={styles.bar}>
      <div className={styles.field}>
        <label htmlFor="listen-time">Listen time</label>
        <select
          id="listen-time"
          className={styles.control}
          value={showCustom ? "custom" : String(thresholdMs)}
          aria-describedby="listen-time-help"
          onChange={onSelect}
        >
          {THRESHOLD_PRESETS.map((preset) => (
            <option key={preset.ms} value={preset.ms}>
              {preset.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>
      {showCustom ? (
        <div className={styles.field}>
          <label htmlFor="listen-seconds">Seconds</label>
          <input
            id="listen-seconds"
            className={`${styles.control} ${styles.seconds}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SECONDS}
            step={1}
            value={draft}
            onChange={onSeconds}
            onBlur={onSecondsBlur}
          />
        </div>
      ) : null}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={prefs.includePodcasts}
          disabled={noPodcasts}
          aria-describedby={noPodcasts ? "podcasts-note" : undefined}
          onChange={(event) => setPrefs({ includePodcasts: event.target.checked })}
        />
        Include podcasts
      </label>
      <p id="listen-time-help" className={styles.help}>
        Short plays are left out so a quick tap is not counted as listening. All plays counts
        every row.
      </p>
      {noPodcasts ? (
        <p id="podcasts-note" className={styles.help}>
          This data has no podcasts.
        </p>
      ) : null}
    </div>
  );
}
