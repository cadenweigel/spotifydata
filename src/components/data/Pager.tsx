/**
 * The footer under the Data table.
 * It shows the range, moves between pages, and sets the page size.
 */

import { formatInt } from "@/data/format";
import { PAGE_SIZES, type PageSize } from "@/data/dataParams";
import styles from "./Pager.module.css";

type PagerProps = {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  start: number;
  end: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize: (pageSize: PageSize) => void;
};

/**
 * Renders the range sentence and the page controls.
 * Input is the current page, the totals, and the noun for this kind.
 * Previous is off on the first page. Next is off on the last page.
 * First and Last appear when there are more than ten pages.
 */
export function Pager({
  page,
  pageCount,
  pageSize,
  start,
  end,
  total,
  noun,
  onPage,
  onPageSize,
}: PagerProps) {
  const showEnds = pageCount > 10;
  const onFirst = page === 1;
  const onLast = page === pageCount;

  return (
    <div className={styles.pager}>
      <p className={styles.summary}>{showing(start, end, total, noun)}</p>
      <div className={styles.controls}>
        <nav className={styles.nav} aria-label="Pagination">
          {showEnds ? (
            <button type="button" className={styles.button} onClick={() => onPage(1)} disabled={onFirst}>
              First
            </button>
          ) : null}
          <button
            type="button"
            className={styles.button}
            onClick={() => onPage(page - 1)}
            disabled={onFirst}
          >
            Previous
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => onPage(page + 1)}
            disabled={onLast}
          >
            Next
          </button>
          {showEnds ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => onPage(pageCount)}
              disabled={onLast}
            >
              Last
            </button>
          ) : null}
        </nav>
        <label className={styles.size}>
          Rows per page
          <select
            className={styles.select}
            value={pageSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value === 25 || value === 50 || value === 100) onPageSize(value);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/** "Showing 1–100 of 4,382 artists", or one number when the page holds a single row. */
function showing(start: number, end: number, total: number, noun: string): string {
  if (total === 0) return `Showing 0 ${noun}`;
  const count = formatInt(total);
  if (start === end) return `Showing ${formatInt(start)} of ${count} ${noun}`;
  return `Showing ${formatInt(start)}\u2013${formatInt(end)} of ${count} ${noun}`;
}
