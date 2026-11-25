/**
 * Top bar. The app name goes home. Data, Graphs, and Analysis are the other routes.
 * Those links are hidden until a dataset is loaded. The current route is highlighted.
 */

import { NavLink } from "react-router-dom";
import { useDataset } from "@/state/useDataset";
import { DatasetSummary } from "./DatasetSummary";
import styles from "./NavBar.module.css";

const links = [
  { to: "/data", label: "Data", end: false },
  { to: "/graphs", label: "Graphs", end: true },
  { to: "/analysis", label: "Analysis", end: true },
] as const;

/** Renders the brand link, the dataset summary, and the three section links. */
export function NavBar() {
  const { dataset } = useDataset();
  return (
    <nav className={styles.nav} aria-label="Main">
      <NavLink to="/" className={styles.brand} end>
        Spotify Data
      </NavLink>
      <DatasetSummary />
      {dataset ? (
        <ul className={styles.links}>
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  isActive ? `${styles.link} ${styles.active}` : styles.link
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
