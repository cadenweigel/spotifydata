/**
 * Renders a component inside the same providers the app uses.
 * Tests pass a memory store when a dataset should already be loaded.
 * Preferences are cleared first so a previous test's threshold cannot leak.
 */

import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { DatasetProvider } from "@/state/DatasetProvider";
import type { DatasetStore } from "@/state/datasetStore";
import { PREFS_KEY } from "@/state/prefsStorage";
import { PrefsProvider } from "@/state/PrefsProvider";
import { memoryDatasetStore } from "@/test/memoryDatasetStore";

type RenderOptions = {
  /** Path the router starts on. Defaults to "/". */
  route?: string;
  /** Store the dataset provider reads. Defaults to an empty memory store. */
  store?: DatasetStore;
};

/**
 * Renders ui with the router, preferences, and dataset provider.
 * Input is the element and an optional route or store.
 * Returns the Testing Library result. localStorage prefs are removed first.
 */
export function renderWithProviders(
  ui: ReactNode,
  options: RenderOptions = {},
): RenderResult {
  localStorage.removeItem(PREFS_KEY);
  const store = options.store ?? memoryDatasetStore();
  return render(
    <MemoryRouter initialEntries={[options.route ?? "/"]}>
      <PrefsProvider>
        <DatasetProvider store={store}>{ui}</DatasetProvider>
      </PrefsProvider>
    </MemoryRouter>,
  );
}
