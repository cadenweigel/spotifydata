/**
 * Tests for the column panel: Escape closes it, and a locked box stays on.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColumnPicker, type PickerColumn } from "./ColumnPicker";

const columns: PickerColumn[] = [
  { id: "rank", label: "#", locked: true, checked: true, note: null },
  { id: "name", label: "Artist", locked: true, checked: true, note: null },
  {
    id: "streams",
    label: "Streams",
    locked: true,
    checked: true,
    note: "Shown because it is the current sort",
  },
  { id: "listenTime", label: "Listen time", locked: false, checked: true, note: null },
];

describe("ColumnPicker", () => {
  // Escape closes the panel and does not toggle a locked box.
  // Input: open the panel, press Escape, open it again, click Artist.
  // Expected: the panel is gone, then Artist is still checked and onToggle was not called.
  it("closes on Escape and keeps locked columns checked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ColumnPicker columns={columns} onToggle={onToggle} onSelectAll={vi.fn()} onClear={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getByRole("group", { name: "Columns" })).toBeInTheDocument();
    expect(screen.getByText("Shown because it is the current sort")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Columns" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columns" }));
    const artist = screen.getByRole("checkbox", { name: "Artist" });
    expect(artist).toBeChecked();
    expect(artist).toBeDisabled();
    await user.click(artist);
    expect(onToggle).not.toHaveBeenCalled();
    expect(artist).toBeChecked();
  });
});
