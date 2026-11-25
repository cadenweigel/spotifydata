/**
 * Chrome shared by every page: the nav bar, then the active route.
 * A file dragged onto the window is not opened as a new page.
 */

import { useEffect } from "react";
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

/**
 * Stops a dropped file from navigating the tab.
 * Input is the drag event. Only a file drag is cancelled, so text drags still work.
 */
function blockFileNavigation(event: DragEvent) {
  const types = event.dataTransfer?.types;
  if (!types || !Array.from(types).includes("Files")) return;
  event.preventDefault();
}

/** Renders the nav, the listen-time bar, and the matched page. */
export function AppLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.addEventListener("dragover", blockFileNavigation);
    window.addEventListener("drop", blockFileNavigation);
    return () => {
      window.removeEventListener("dragover", blockFileNavigation);
      window.removeEventListener("drop", blockFileNavigation);
    };
  }, []);

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
