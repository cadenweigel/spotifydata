/**
 * A short titled message used when an upload did not produce a hub.
 * The optional action is a control under the message, such as a link.
 */

import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
};

/**
 * Renders a title and a message.
 * Input is the title, the message body, and an optional action.
 * The region is a status so a result is announced when it appears.
 */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className={styles.box} role="status">
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.message}>{children}</div>
      {action}
    </div>
  );
}
