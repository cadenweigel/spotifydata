/**
 * Chrome shared by every page: the nav bar, then the active route.
 */

import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar";
import styles from "./AppLayout.module.css";

/** Renders the nav and the matched page in the main region. */
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <NavBar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
