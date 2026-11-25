/**
 * Links from the home page to Data, Graphs, and Analysis.
 * Each card is one link. Analysis is still undefined, and the card says so.
 */

import { Link } from "react-router-dom";
import styles from "./PageCards.module.css";

const cards = [
  {
    to: "/data",
    title: "Data",
    body: "Ranked tables of artists, albums, and songs.",
  },
  {
    to: "/graphs",
    title: "Graphs",
    body: "Charts of listening over time and by artist, hour, and platform.",
  },
  {
    to: "/analysis",
    title: "Analysis",
    body: "This page is not defined yet.",
  },
] as const;

/** Renders the three page cards. Input is none. The routes are fixed. */
export function PageCards() {
  return (
    <ul className={styles.grid}>
      {cards.map((card) => (
        <li key={card.to}>
          <Link to={card.to} className={styles.card}>
            <h2 className={styles.title}>{card.title}</h2>
            <p className={styles.body}>{card.body}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
