/**
 * File errors and ingest warnings from the latest upload.
 * Errors are grouped by file and, until "Show all", capped.
 * Dismissal is kept in this component, so a reload brings the notes back.
 */

import { useEffect, useState } from "react";
import type { FileError, IngestWarning } from "@/data/types";
import {
  ERROR_PREVIEW_LIMIT,
  groupFileErrors,
  indexFileErrors,
  limitErrorGroups,
  warningSentence,
} from "./issueText";
import styles from "./IssueList.module.css";

type IssueListProps = {
  fileErrors: readonly FileError[];
  warnings: readonly IngestWarning[];
  /** True on the hub, where each note can be dismissed for this visit. */
  dismissible: boolean;
};

/**
 * Renders the file errors and the warning sentences.
 * Input is the ingest issues and whether each one can be dismissed.
 * Returns nothing when both lists are empty.
 */
export function IssueList({ fileErrors, warnings, dismissible }: IssueListProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const signature = issueSignature(fileErrors, warnings);

  useEffect(() => {
    setDismissed(new Set());
    setExpanded(false);
  }, [signature]);

  const keptErrors = indexFileErrors(fileErrors).filter(
    (item) => !dismissed.has(`error:${item.index}`),
  );
  const groups = groupFileErrors(keptErrors);
  const shownGroups = expanded ? groups : limitErrorGroups(groups, ERROR_PREVIEW_LIMIT);
  const errorCount = keptErrors.length;
  const warningItems = warnings
    .map((warning, index) => ({ warning, index, sentence: warningSentence(warning) }))
    .filter((item) => !dismissed.has(`warning:${item.index}`));

  if (errorCount === 0 && warningItems.length === 0) return null;

  const dismiss = (key: string) => {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  return (
    <div className={styles.block}>
      {errorCount > 0 ? (
        <div className={styles.block}>
          <h2 className={styles.heading}>File problems</h2>
          <ul className={styles.files}>
            {shownGroups.map((group) => (
              <li key={group.fileName}>
                <p className={styles.fileName}>{group.fileName}</p>
                <ul className={styles.messages}>
                  {group.items.map((item) => (
                    <li key={item.index} className={styles.item}>
                      <span>{item.message}</span>
                      {dismissible ? (
                        <button
                          type="button"
                          className={styles.dismiss}
                          onClick={() => dismiss(`error:${item.index}`)}
                          aria-label={`Dismiss: ${item.message}`}
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {errorCount > ERROR_PREVIEW_LIMIT ? (
            <button
              type="button"
              className={styles.more}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : "Show all"}
            </button>
          ) : null}
        </div>
      ) : null}
      {warningItems.length > 0 ? (
        <div className={styles.block}>
          <h2 className={styles.heading}>Notes</h2>
          <ul className={styles.notes}>
            {warningItems.map((item) => (
              <li key={item.index} className={styles.note}>
                <span>{item.sentence}</span>
                {dismissible ? (
                  <button
                    type="button"
                    className={styles.dismiss}
                    onClick={() => dismiss(`warning:${item.index}`)}
                    aria-label={`Dismiss: ${item.sentence}`}
                  >
                    Dismiss
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A stable key for the current issues.
 * Input is the two lists. The same messages produce the same string,
 * so a re-render does not clear a dismissal. A new upload does.
 */
function issueSignature(
  fileErrors: readonly FileError[],
  warnings: readonly IngestWarning[],
): string {
  return JSON.stringify({ fileErrors, warnings });
}
