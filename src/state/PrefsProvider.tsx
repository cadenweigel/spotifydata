/**
 * Holds the UI preferences for every page.
 * The first read happens here. A change writes through prefsStorage.
 * Another tab's write arrives as a storage event and replaces this copy.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  PREFS_KEY,
  applyPrefsPatch,
  readPrefs,
  writePrefs,
  type Prefs,
  type PrefsPatch,
} from "./prefsStorage";
import { PrefsContext } from "./usePrefs";

type PrefsProviderProps = {
  children: ReactNode;
};

/** Makes the preferences and setPrefs available under this tree. */
export function PrefsProvider({ children }: PrefsProviderProps) {
  const [loaded] = useState(readPrefs);
  const [prefs, setPrefsState] = useState<Prefs>(loaded.prefs);
  const extrasRef = useRef(loaded.extras);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (loaded.canWrite && loaded.changed) writePrefs(loaded.prefs, loaded.extras);
  }, [loaded]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== PREFS_KEY) return;
      const next = readPrefs();
      if (!next.canWrite) return;
      extrasRef.current = next.extras;
      prefsRef.current = next.prefs;
      setPrefsState(next.prefs);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPrefs = useCallback((patch: PrefsPatch) => {
    const next = applyPrefsPatch(prefsRef.current, patch);
    prefsRef.current = next;
    writePrefs(next, extrasRef.current);
    setPrefsState(next);
  }, []);

  return (
    <PrefsContext.Provider value={{ prefs, setPrefs }}>{children}</PrefsContext.Provider>
  );
}
