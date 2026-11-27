/**
 * The artist, album, or track picker under the breakdown select.
 * Suggestions come from an index the controls build once per dataset.
 * This component only filters that list and reports the chosen keys.
 */

import { useEffect, useId, useState } from "react";
import type { EntityKind } from "@/data/types";
import { matchEntityHits, type EntityHit } from "@/data/graph/entityIndex";
import { MAX_SERIES } from "@/data/graph/graphQuery";
import { seriesColor } from "./palette";
import styles from "./EntitySearch.module.css";

const KIND_LABEL: Record<EntityKind, string> = {
  artist: "Artists",
  album: "Albums",
  track: "Tracks",
};

type EntitySearchProps = {
  kind: EntityKind;
  hits: readonly EntityHit[];
  selectedKeys: readonly string[];
  seriesKeys: readonly string[];
  labels: Record<string, string>;
  /** Changes when One artist is chosen, so the box can take focus. */
  focusToken: number;
  onChange: (keys: string[]) => void;
};

/**
 * Renders the chips and the search box.
 * Input is the kind, the index, the chosen keys, and the series ranks used
 * to color the chips. At 8 keys the box is disabled. An empty selection
 * is labelled Top 8.
 */
export function EntitySearch({
  kind,
  hits,
  selectedKeys,
  seriesKeys,
  labels,
  focusToken,
  onChange,
}: EntitySearchProps) {
  const listId = useId();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const full = selectedKeys.length >= MAX_SERIES;
  const selected = new Set(selectedKeys);
  const suggestions = full ? [] : matchEntityHits(hits, debounced, selected);
  const names = new Map(hits.map((hit) => [hit.key, hit.name]));

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text), 150);
    return () => window.clearTimeout(id);
  }, [text]);

  useEffect(() => {
    if (focusToken === 0) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById(`${listId}-input`)?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusToken, listId]);

  const choose = (hit: EntityHit) => {
    if (selected.has(hit.key) || full) return;
    onChange([...selectedKeys, hit.key]);
    setText("");
    setDebounced("");
    setOpen(false);
    setActive(0);
  };

  const remove = (key: string) => {
    onChange(selectedKeys.filter((item) => item !== key));
  };

  return (
    <div className={styles.wrap}>
      <span className={styles.label} id={`${listId}-label`}>
        {selectedKeys.length === 0 ? "Top 8" : KIND_LABEL[kind]}
      </span>
      {selectedKeys.length > 0 ? (
        <ul className={styles.chips}>
          {selectedKeys.map((key) => {
            const rank = seriesKeys.indexOf(key);
            const color = rank >= 0 ? seriesColor(rank, key) : undefined;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={styles.chip}
                  style={color ? { borderColor: color } : undefined}
                  onClick={() => remove(key)}
                >
                  {names.get(key) ?? labels[key] ?? key}
                  <span className={styles.srOnly}>Remove</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <input
        id={`${listId}-input`}
        className={styles.input}
        role="combobox"
        aria-labelledby={`${listId}-label`}
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && suggestions[active] ? `${listId}-option-${active}` : undefined
        }
        value={text}
        disabled={full}
        placeholder={full ? "Maximum of 8" : `Search ${KIND_LABEL[kind].toLowerCase()}`}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const hit = suggestions[active];
            if (hit) choose(hit);
          } else if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "Backspace" && text === "" && selectedKeys.length > 0) {
            const last = selectedKeys[selectedKeys.length - 1];
            if (last) remove(last);
          }
        }}
      />
      {full ? <p className={styles.note}>Maximum of 8</p> : null}
      {open && suggestions.length > 0 ? (
        <ul className={styles.list} id={listId} role="listbox">
          {suggestions.map((hit, index) => (
            <li key={hit.key} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? styles.active : styles.option}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(hit)}
              >
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
