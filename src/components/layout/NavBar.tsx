import { NavLink } from "react-router-dom";
import styles from "./NavBar.module.css";

const links = [
  { to: "/data", label: "Data", end: false },
  { to: "/graphs", label: "Graphs", end: true },
  { to: "/analysis", label: "Analysis", end: true },
] as const;

export function NavBar() {
  return (
    <nav className={styles.nav} aria-label="Main">
      <NavLink to="/" className={styles.brand} end>
        Spotify Data
      </NavLink>
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
    </nav>
  );
}
