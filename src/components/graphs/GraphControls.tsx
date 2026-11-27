/**
 * The controls on the Graphs page.
 * Presets, the measure, the over-time toggle, the breakdown, the entity
 * search, and the date range. This component does not read the URL.
 * The page passes the query and applies the next one.
 */

import { useMemo, useRef, useState } from "react";
import { datasetDateRange } from "@/data/dataParams";
import { entityIndex } from "@/data/graph/entityIndex";
import {
  MEASURE_LABELS,
  availableMeasures,
  isEntityBreakdown,
  type Breakdown,
  type ChartType,
  type GraphQuery,
  type TimeBucket,
} from "@/data/graph/graphQuery";
import { DateRangeInput } from "@/components/common/DateRangeInput";
import { useDataset } from "@/state/useDataset";
import { usePrefs } from "@/state/usePrefs";
import { EntitySearch } from "./EntitySearch";
import { PresetRow } from "./PresetRow";
import { useGraph } from "./useGraph";
import styles from "./GraphControls.module.css";

const BUCKETS: { value: TimeBucket; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const CHARTS: { value: ChartType; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "bar", label: "Bar" },
];

const CATEGORY_NOTE = "Hour and weekday are categories, so Over time is off.";

type GraphControlsProps = {
  query: GraphQuery;
  selectedPresetId: string | null;
  searchFocus: number;
  onQuery: (query: GraphQuery, presetId: string | null) => void;
};

/**
 * Renders the preset row and the fields under it.
 * Input is the current query and the callback that stores the next one.
 * Turning Over time off from a single series switches the breakdown to
 * weekday. Turning it back on restores the bucket, chart, and breakdown
 * from the last time the chart was over time.
 */
export function GraphControls({
  query,
  selectedPresetId,
  searchFocus,
  onQuery,
}: GraphControlsProps) {
  const { dataset } = useDataset();
  const [prefs] = usePrefs();
  const model = useGraph(query);
  const [note, setNote] = useState<string | null>(null);
  const remembered = useRef({
    timeBucket: (query.timeBucket ?? "month") as TimeBucket,
    chart: (query.timeBucket === null ? "area" : query.chart) as ChartType,
    breakdown: (query.timeBucket === null ? "none" : query.breakdown) as Breakdown,
  });
  if (query.timeBucket !== null) {
    remembered.current = {
      timeBucket: query.timeBucket,
      chart: query.chart,
      breakdown: query.breakdown,
    };
  }

  const overTime = query.timeBucket !== null;
  const range = dataset ? datasetDateRange(dataset.meta) : { from: null, to: null };
  const hits = useMemo(() => {
    if (!dataset || !isEntityBreakdown(query.breakdown)) return [];
    return entityIndex(dataset.streams, query.breakdown, {
      thresholdMs: prefs.streamThresholdMs,
      includePodcasts: prefs.includePodcasts,
    });
  }, [dataset, query.breakdown, prefs.streamThresholdMs, prefs.includePodcasts]);

  const apply = (next: GraphQuery) => onQuery(next, null);

  const setOverTime = (on: boolean) => {
    setNote(null);
    if (on) {
      apply({
        ...query,
        timeBucket: remembered.current.timeBucket,
        chart: remembered.current.chart,
        breakdown: remembered.current.breakdown,
      });
      return;
    }
    apply({
      ...query,
      timeBucket: null,
      chart: "bar",
      breakdown: query.breakdown === "none" ? "weekday" : query.breakdown,
    });
  };

  const setBreakdown = (breakdown: Breakdown) => {
    if (breakdown === "hour" || breakdown === "weekday") {
      if (query.timeBucket !== null) setNote(CATEGORY_NOTE);
      else setNote(null);
      apply({ ...query, breakdown, timeBucket: null, chart: "bar" });
      return;
    }
    setNote(null);
    if (!overTime && breakdown === "none") {
      apply({
        ...query,
        breakdown: "none",
        timeBucket: remembered.current.timeBucket,
        chart: remembered.current.chart,
      });
      return;
    }
    apply({ ...query, breakdown });
  };

  return (
    <div className={styles.controls}>
      <PresetRow
        selectedId={selectedPresetId}
        onSelect={(next, presetId) => {
          setNote(null);
          onQuery(next, presetId);
        }}
      />
      <div className={styles.fields}>
        <label className={styles.field}>
          Measure
          <select
            className={styles.select}
            value={query.measure}
            onChange={(event) => apply({ ...query, measure: event.target.value as GraphQuery["measure"] })}
          >
            {availableMeasures(query.timeBucket).map((measure) => (
              <option key={measure} value={measure}>
                {MEASURE_LABELS[measure]}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.axis} role="group" aria-label="Axis">
          <button
            type="button"
            className={overTime ? styles.axisOn : styles.axisOff}
            aria-pressed={overTime}
            onClick={() => setOverTime(true)}
          >
            Over time
          </button>
          <button
            type="button"
            className={styles.compare}
            aria-pressed={!overTime}
            onClick={() => setOverTime(false)}
          >
            Compare categories
          </button>
        </div>
        {overTime ? (
          <>
            <label className={styles.field}>
              Time
              <select
                className={styles.select}
                value={query.timeBucket ?? "month"}
                onChange={(event) =>
                  apply({ ...query, timeBucket: event.target.value as TimeBucket })
                }
              >
                {BUCKETS.map((bucket) => (
                  <option key={bucket.value} value={bucket.value}>
                    {bucket.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Chart
              <select
                className={styles.select}
                value={query.chart}
                onChange={(event) => apply({ ...query, chart: event.target.value as ChartType })}
              >
                {CHARTS.map((chart) => (
                  <option key={chart.value} value={chart.value}>
                    {chart.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label className={styles.field}>
          Breakdown
          <select
            className={styles.select}
            value={query.breakdown}
            onChange={(event) => setBreakdown(event.target.value as Breakdown)}
          >
            <option value="none">None</option>
            <optgroup label="Content">
              <option value="artist">Artist</option>
              <option value="album">Album</option>
              <option value="track">Track</option>
            </optgroup>
            <optgroup label="Playback">
              <option value="platform">Platform</option>
              <option value="country">Country</option>
            </optgroup>
            <optgroup label="Time of listening">
              <option value="weekday">Weekday</option>
              <option value="hour">Hour</option>
            </optgroup>
          </select>
        </label>
      </div>
      {note ? <p className={styles.note}>{note}</p> : null}
      {isEntityBreakdown(query.breakdown) ? (
        <EntitySearch
          kind={query.breakdown}
          hits={hits}
          selectedKeys={query.entityKeys}
          seriesKeys={model.seriesKeys}
          labels={model.seriesLabels}
          focusToken={searchFocus}
          onChange={(entityKeys) => apply({ ...query, entityKeys })}
        />
      ) : null}
      <DateRangeInput
        from={query.from ?? range.from ?? ""}
        to={query.to ?? range.to ?? ""}
        min={range.from ?? undefined}
        max={range.to ?? undefined}
        showReset={query.from !== null || query.to !== null}
        onChange={(from, to) => {
          apply({
            ...query,
            from: from === range.from ? null : from,
            to: to === range.to ? null : to,
          });
        }}
        onReset={() => apply({ ...query, from: null, to: null })}
      />
    </div>
  );
}
