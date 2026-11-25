/**
 * Read access to the UI preferences shared by every page.
 * The provider owns the value. A caller outside that provider gets a
 * clear error instead of a silent default.
 */

import { createContext, useContext } from "react";
import type { Prefs, PrefsPatch } from "./prefsStorage";

export type PrefsContextValue = {
  prefs: Prefs;
  /** Updates the given fields and writes them. Invalid fields are ignored. */
  setPrefs: (patch: PrefsPatch) => void;
};

export const PrefsContext = createContext<PrefsContextValue | null>(null);

/**
 * Reads the shared preferences.
 * Input is none. The provider above this component supplies the value.
 * Returns the preferences and setPrefs.
 * Throws when there is no provider, so a missing wrap fails loudly.
 */
export function usePrefs(): [Prefs, (patch: PrefsPatch) => void] {
  const value = useContext(PrefsContext);
  if (value === null) {
    throw new Error("usePrefs must be used inside PrefsProvider");
  }
  return [value.prefs, value.setPrefs];
}
