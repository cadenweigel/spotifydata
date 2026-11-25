/**
 * Artists, Albums, and Songs as links.
 * The links keep the current sort, search, and dates. Page and columns
 * are left off, because those do not carry across kinds.
 */

import { Link } from "react-router-dom";
import type { EntityKind } from "@/data/types";
import styles from "./KindTabs.module.css";

const tabs: { kind: EntityKind; param: string; label: string }[] = [
  { kind: "artist", param: "artists", label: "Artists" },
  { kind: "album", param: "albums", label: "Albums" },
  { kind: "track", param: "songs", label: "Songs" },
];

type KindTabsProps = {
  kind: EntityKind;
  /** Query string to keep, including the leading ? when it is not empty. */
  search: string;
};

/** Renders the three kind links. The active one is the current page. */
export function KindTabs({ kind, search }: KindTabsProps) {
  return (
    <nav className={styles.tabs} aria-label="Data type">
      {tabs.map((tab) => {
        const current = tab.kind === kind;
        return (
          <Link
            key={tab.param}
            to={{ pathname: `/data/${tab.param}`, search }}
            className={current ? `${styles.tab} ${styles.current}` : styles.tab}
            aria-current={current ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
