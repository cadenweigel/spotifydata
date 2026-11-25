/**
 * The five ways to order a Data table.
 * The select is the only sort control. Column headers do not sort.
 */

import type { SortKey } from "@/data/types";
import styles from "./SortSelect.module.css";

const options: { value: SortKey; label: string; hint: string }[] = [
  { value: "streams", label: "Streams", hint: "highest first" },
  { value: "listenTime", label: "Listen time", hint: "highest first" },
  { value: "firstStream", label: "First stream", hint: "oldest first" },
  { value: "lastStream", label: "Most recently streamed", hint: "newest first" },
  { value: "alpha", label: "Alphabetical", hint: "A–Z" },
];

type SortSelectProps = {
  sort: SortKey;
  onChange: (sort: SortKey) => void;
};

/** Renders the sort select and a short hint for the current direction. */
export function SortSelect({ sort, onChange }: SortSelectProps) {
  const hint = options.find((option) => option.value === sort)?.hint ?? "";

  return (
    <div className={styles.field}>
      <label htmlFor="data-sort">Sort</label>
      <select
        id="data-sort"
        className={styles.select}
        value={sort}
        aria-describedby="sort-hint"
        onChange={(event) => onChange(event.target.value as SortKey)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span id="sort-hint" className={styles.hint}>
        {hint}
      </span>
    </div>
  );
}
