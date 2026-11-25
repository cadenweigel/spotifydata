/**
 * Tests that a preference change is written, repaired, and seen by another tab.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PrefsProvider } from "./PrefsProvider";
import { PREFS_KEY, writePrefs, defaultPrefs } from "./prefsStorage";
import { usePrefs } from "./usePrefs";

beforeEach(() => {
  localStorage.removeItem(PREFS_KEY);
});

describe("PrefsProvider", () => {
  // A change is still there after the provider is mounted again.
  // Input: the probe sets the threshold to 45 seconds, then the tree remounts.
  // Expected: the new mount reads 45000 from localStorage.
  it("writes a change and reads it back on the next mount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Set 45 seconds" }));
    expect(screen.getByTestId("threshold")).toHaveTextContent("45000");
    unmount();

    render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    expect(screen.getByTestId("threshold")).toHaveTextContent("45000");
  });

  // Invalid stored text is replaced with the defaults.
  // Input: the key holds "{".
  // Expected: the probe shows 30000, and the stored text is valid JSON again.
  it("replaces invalid stored text with the defaults", () => {
    localStorage.setItem(PREFS_KEY, "{");
    render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    expect(screen.getByTestId("threshold")).toHaveTextContent("30000");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "")).toMatchObject(defaultPrefs());
  });

  // A newer stored version is shown as the defaults and left on disk.
  // Input: version 2 with a 45 second threshold.
  // Expected: the probe shows 30000, and the stored version is still 2.
  it("leaves a newer version untouched", () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ version: 2, streamThresholdMs: 45_000, includePodcasts: true }),
    );
    render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    expect(screen.getByTestId("threshold")).toHaveTextContent("30000");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "").version).toBe(2);
  });

  // Another tab's write updates this tab without a second write.
  // Input: writePrefs sets 60 seconds, then a storage event for the prefs key.
  // Expected: the probe shows 60000.
  it("applies a storage event from another tab", () => {
    render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    writePrefs({ ...defaultPrefs(), streamThresholdMs: 60_000 }, {});
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: PREFS_KEY }));
    });
    expect(screen.getByTestId("threshold")).toHaveTextContent("60000");
  });
});

/** Shows the threshold and can set it to 45 seconds. */
function Probe() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <div>
      <span data-testid="threshold">{prefs.streamThresholdMs}</span>
      <button type="button" onClick={() => setPrefs({ streamThresholdMs: 45_000 })}>
        Set 45 seconds
      </button>
    </div>
  );
}
