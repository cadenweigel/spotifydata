/**
 * Checkboxes for the Data table columns.
 * Rank, name, and the sort column are on and cannot be turned off.
 * Escape closes the panel.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { ColumnId } from "@/data/columns";
import styles from "./ColumnPicker.module.css";

export type PickerColumn = {
  id: ColumnId;
  label: string;
  locked: boolean;
  checked: boolean;
  /** Set on the sort column. Null for the others. */
  note: string | null;
};

type ColumnPickerProps = {
  columns: readonly PickerColumn[];
  onToggle: (id: ColumnId) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

/**
 * Renders the Columns button and, when open, the checkbox list.
 * Input is the columns in picker order and the three callbacks.
 * Locked boxes are checked and disabled. Select all and Clear
 * act on the optional columns only.
 */
export function ColumnPicker({ columns, onToggle, onSelectAll, onClear }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const optional = columns.filter((column) => !column.locked);
  const checkedOptional = optional.filter((column) => column.checked).length;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Columns
      </button>
      {open ? (
        <div id={panelId} className={styles.panel} role="group" aria-label="Columns">
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={onSelectAll}
              disabled={optional.length === 0 || checkedOptional === optional.length}
            >
              Select all
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={onClear}
              disabled={checkedOptional === 0}
            >
              Clear
            </button>
          </div>
          <ul className={styles.list}>
            {columns.map((column) => (
              <li key={column.id}>
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={column.checked}
                    disabled={column.locked}
                    onChange={() => {
                      if (!column.locked) onToggle(column.id);
                    }}
                  />
                  <span>{column.label}</span>
                  {column.note ? <span className={styles.note}>{column.note}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
