/**
 * The preset buttons. Each one fills the whole query.
 * Which button looks selected is decided by the page, because two presets
 * can share a query until the user picks an entity.
 */

import { GRAPH_PRESETS, type GraphQuery } from "@/data/graph/graphQuery";
import styles from "./PresetRow.module.css";

type PresetRowProps = {
  selectedId: string | null;
  onSelect: (query: GraphQuery, presetId: string) => void;
};

/**
 * Renders one button per preset.
 * Input is the selected id and the callback. Clicking a button passes a
 * copy of that preset's query, so the preset list itself stays unchanged.
 */
export function PresetRow({ selectedId, onSelect }: PresetRowProps) {
  return (
    <div className={styles.row} role="group" aria-label="Presets">
      {GRAPH_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={preset.id === selectedId ? styles.selected : styles.button}
          aria-pressed={preset.id === selectedId}
          onClick={() =>
            onSelect(
              { ...preset.query, entityKeys: [...preset.query.entityKeys] },
              preset.id,
            )
          }
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
