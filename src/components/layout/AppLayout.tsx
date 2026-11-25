/**
 * Chrome shared by every page: the nav bar, then the active route.
 */

import { Outlet, useLocation } from "react-router-dom";
import { FilterBar } from "./FilterBar";
import { NavBar } from "./NavBar";
import styles from "./AppLayout.module.css";

/**
 * True on the pages whose counts use the listen-time setting.
 * Input is the current path.
 * The not-found page returns false.
 */
function showsFilters(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/graphs" ||
    pathname === "/analysis" ||
    pathname === "/data" ||
    pathname.startsWith("/data/")
  );
}

/** Renders the nav, the listen-time bar, and the matched page. */
export function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className={styles.shell}>
      <NavBar />
      {showsFilters(pathname) ? <FilterBar /> : null}
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
