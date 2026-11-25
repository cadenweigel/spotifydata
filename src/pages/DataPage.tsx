/**
 * Artists, albums, and songs.
 * The kind comes from the path. Sort, page, columns, search, and dates
 * come from the query string through useDataView.
 */

import { useEffect } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/common/EmptyState";
import { DataTable } from "@/components/data/DataTable";
import { DataToolbar } from "@/components/data/DataToolbar";
import { Pager } from "@/components/data/Pager";
import { kindFromParam } from "@/data/dataParams";
import type { EntityKind } from "@/data/types";
import { useDataView } from "./useDataView";
import pageStyles from "./Page.module.css";
import styles from "./DataPage.module.css";

/** Reads :kind and shows that table. An unknown kind goes to artists. */
export function DataPage() {
  const { kind: param } = useParams();
  const kind = kindFromParam(param);
  if (kind === null) return <DataRedirect />;
  return <DataView kind={kind} />;
}

/** Sends /data/something-else to /data/artists and keeps the query string. */
function DataRedirect() {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={{ pathname: "/data/artists", search }} replace />;
}

/** The table for one kind, once the visit's dataset is ready. */
function DataView({ kind }: { kind: EntityKind }) {
  const view = useDataView(kind);

  useEffect(() => {
    document.title = `${view.title} · Spotify Data`;
  }, [view.title]);

  if (!view.ready) {
    return <p className={styles.note}>Loading saved data…</p>;
  }

  return (
    <div className={styles.page}>
      <h1 className={pageStyles.title}>{view.title}</h1>
      <DataToolbar
        kind={view.kind}
        tabSearch={view.tabSearch}
        sort={view.sort}
        onSort={view.setSort}
        query={view.query}
        onQuery={view.setQuery}
        from={view.from}
        to={view.to}
        min={view.rangeFrom}
        max={view.rangeTo}
        datesDiffer={view.datesDiffer}
        onDates={view.setDates}
        onResetDates={view.resetDates}
        columns={view.pickerColumns}
        onToggleColumn={view.toggleColumn}
        onSelectAllColumns={view.selectAllColumns}
        onClearColumns={view.clearColumns}
      />
      {view.empty === "no-albums" ? (
        <EmptyState title="No album information in this data">
          This export has no album names.
        </EmptyState>
      ) : view.empty === "filter" ? (
        <EmptyState
          title="Nothing matches this filter"
          action={
            <button type="button" className={styles.button} onClick={view.resetFilter}>
              Reset filter
            </button>
          }
        >
          Reset the search and dates to see the full list.
        </EmptyState>
      ) : (
        <>
          <DataTable
            caption={view.caption}
            kind={view.kind}
            columnIds={view.columns}
            rows={view.rows}
            startRank={view.startRank}
            page={view.page}
          />
          <Pager
            page={view.page}
            pageCount={view.pageCount}
            pageSize={view.pageSize}
            start={view.startRank}
            end={view.endRank}
            total={view.total}
            noun={view.noun}
            onPage={view.setPage}
            onPageSize={view.setPageSize}
          />
        </>
      )}
    </div>
  );
}
