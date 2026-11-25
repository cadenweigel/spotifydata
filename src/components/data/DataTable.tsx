/**
 * One page of the Data table. Display only.
 * Order and rank come from the caller. Header cells do not sort.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  columnLabel,
  isNumericColumn,
  type ColumnId,
} from "@/data/columns";
import { formatDate, formatDuration, formatInt, formatPercent } from "@/data/format";
import type { EntityKind, EntityRow } from "@/data/types";
import styles from "./DataTable.module.css";

type RankedRow = EntityRow & { rank: number };

type DataTableProps = {
  caption: string;
  kind: EntityKind;
  columnIds: readonly ColumnId[];
  rows: readonly EntityRow[];
  startRank: number;
  /** Current page. A change scrolls the table to the top. */
  page: number;
};

/**
 * Renders the current page.
 * Input is the caption, the kind, the visible columns, and the page rows.
 * Rank starts at startRank. Long names truncate, with the full text on hover.
 */
export function DataTable({ caption, kind, columnIds, rows, startRank, page }: DataTableProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const seenPage = useRef(page);

  useEffect(() => {
    if (seenPage.current === page) return;
    seenPage.current = page;
    const node = topRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "start" });
    }
  }, [page]);

  const data = useMemo<RankedRow[]>(
    () => rows.map((row, index) => ({ ...row, rank: startRank + index })),
    [rows, startRank],
  );

  const columns = useMemo(
    () => columnIds.map((id) => defineColumn(id, kind)),
    [columnIds, kind],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.key,
    manualSorting: true,
    manualPagination: true,
  });

  return (
    <div className={styles.wrap} ref={topRef}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const id = header.column.id as ColumnId;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    className={isNumericColumn(id) ? styles.numeric : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const id = cell.column.id as ColumnId;
                return (
                  <td key={cell.id} className={isNumericColumn(id) ? styles.numeric : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function defineColumn(id: ColumnId, kind: EntityKind): ColumnDef<RankedRow> {
  if (id === "name") {
    return {
      id,
      header: columnLabel(id, kind),
      accessorKey: "name",
      enableSorting: false,
      cell: ({ row }) => <NameCell name={row.original.name} subtitle={row.original.subtitle} />,
    };
  }
  return {
    id,
    header: columnLabel(id, kind),
    accessorFn: (row) => displayValue(row, id),
    enableSorting: false,
    cell: (info) => info.getValue<string>(),
  };
}

function NameCell({ name, subtitle }: { name: string; subtitle: string | null }) {
  const full = subtitle === null ? name : `${name} — ${subtitle}`;
  return (
    <div className={styles.identity} title={full}>
      <span className={styles.name}>{name}</span>
      {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
    </div>
  );
}

function displayValue(row: RankedRow, id: ColumnId): string {
  switch (id) {
    case "rank":
      return formatInt(row.rank);
    case "name":
      return row.name;
    case "streams":
      return formatInt(row.streams);
    case "listenTime":
      return formatDuration(row.listenTimeMs);
    case "firstStream":
      return formatDate(row.firstStream);
    case "lastStream":
      return formatDate(row.lastStream);
    case "trackCount":
      return row.trackCount === null ? "" : formatInt(row.trackCount);
    case "albumCount":
      return row.albumCount === null ? "" : formatInt(row.albumCount);
    case "skipRate":
      return row.skipRate === null ? "" : formatPercent(row.skipRate);
  }
}
