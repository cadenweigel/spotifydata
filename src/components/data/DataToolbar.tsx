/**
 * The controls above the Data table.
 * Kind, sort, search, dates, and columns. The search box keeps its own
 * text and writes the URL after a short pause, so the cursor does not jump.
 */

import { useEffect, useRef, useState } from "react";
import { DateRangeInput } from "@/components/common/DateRangeInput";
import type { ColumnId } from "@/data/columns";
import type { EntityKind, SortKey } from "@/data/types";
import { ColumnPicker, type PickerColumn } from "./ColumnPicker";
import { KindTabs } from "./KindTabs";
import { SortSelect } from "./SortSelect";
import styles from "./DataToolbar.module.css";

type DataToolbarProps = {
  kind: EntityKind;
  tabSearch: string;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  query: string;
  onQuery: (query: string) => void;
  from: string;
  to: string;
  min: string;
  max: string;
  datesDiffer: boolean;
  onDates: (from: string, to: string) => void;
  onResetDates: () => void;
  columns: readonly PickerColumn[];
  onToggleColumn: (id: ColumnId) => void;
  onSelectAllColumns: () => void;
  onClearColumns: () => void;
};

/** Renders the kind tabs and the filters for one Data view. */
export function DataToolbar({
  kind,
  tabSearch,
  sort,
  onSort,
  query,
  onQuery,
  from,
  to,
  min,
  max,
  datesDiffer,
  onDates,
  onResetDates,
  columns,
  onToggleColumn,
  onSelectAllColumns,
  onClearColumns,
}: DataToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <KindTabs kind={kind} search={tabSearch} />
      <div className={styles.row}>
        <SortSelect sort={sort} onChange={onSort} />
        <ColumnPicker
          columns={columns}
          onToggle={onToggleColumn}
          onSelectAll={onSelectAllColumns}
          onClear={onClearColumns}
        />
      </div>
      <FilterField value={query} onChange={onQuery} />
      <DateRangeInput
        from={from}
        to={to}
        min={min}
        max={max}
        showReset={datesDiffer}
        onChange={onDates}
        onReset={onResetDates}
      />
    </div>
  );
}

/**
 * The name filter.
 * The text the user is typing stays here until 200 ms after the last
 * keystroke, then onChange writes it. A new value from outside, such as
 * Reset or Back, replaces the text. An echo of what we just sent does not.
 */
function FilterField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const sent = useRef(value);

  if (value !== seen) {
    setSeen(value);
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }

  useEffect(() => {
    if (text === value) return;
    const id = window.setTimeout(() => {
      sent.current = text;
      onChange(text);
    }, 200);
    return () => window.clearTimeout(id);
  }, [text, value, onChange]);

  return (
    <div className={styles.search}>
      <label className={styles.label} htmlFor="data-filter">
        Filter
      </label>
      <div className={styles.inputWrap}>
        <input
          id="data-filter"
          className={styles.input}
          type="text"
          value={text}
          placeholder="Name"
          onChange={(event) => setText(event.target.value)}
        />
        {text !== "" ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear filter"
            onClick={() => setText("")}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
