/**
 * Tests for the drop zone: keyboard, drag highlight, disabled controls, and a reset input.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "./DropZone";

describe("DropZone", () => {
  // The empty state offers a drop target, a file picker, and a folder picker.
  // Input: the zone variant, enabled.
  // Expected: those three buttons, a labelled file input, and the folder attribute.
  it("renders the drop target, the file picker, and Upload folder", () => {
    render(<DropZone variant="zone" disabled={false} onFiles={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Drop files here, or choose files" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Upload folder" })).toBeEnabled();
    const files = screen.getByLabelText("Choose JSON or zip files");
    expect(files).toHaveAttribute("accept", ".json,.zip");
    expect(files).toHaveAttribute("multiple");
    expect(screen.getByLabelText("Upload a folder")).toHaveAttribute("webkitdirectory");
    expect(
      screen.getByRole("button", { name: "Drop files here, or choose files" }).parentElement
        ?.querySelector("[aria-live='polite']"),
    ).not.toBeNull();
  });

  // Enter on the zone opens the file picker. The zone is a button, so Space does too.
  // Input: focus the zone and press Enter.
  // Expected: the hidden file input's click runs.
  it("opens the file picker from the keyboard", async () => {
    const user = userEvent.setup();
    render(<DropZone variant="zone" disabled={false} onFiles={vi.fn()} />);
    const input = screen.getByLabelText("Choose JSON or zip files");
    const click = vi.spyOn(input, "click");
    screen.getByRole("button", { name: "Drop files here, or choose files" }).focus();
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalled();
  });

  // Child enter and leave must not flicker the highlight off.
  // Input: enter the zone, enter a child, leave the zone once, then leave again.
  // Expected: still highlighted after the first leave, clear after the depths match.
  it("stays highlighted while the pointer is over a child", () => {
    render(<DropZone variant="zone" disabled={false} onFiles={vi.fn()} />);
    const zone = screen.getByRole("button", { name: "Drop files here, or choose files" })
      .parentElement as HTMLElement;
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Release to upload.")).toBeInTheDocument();
    fireEvent.dragEnter(zone);
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-active", "true");
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-active", "false");
  });

  // A parse in progress refuses another drop and marks the controls disabled.
  // Input: disabled zone.
  // Expected: aria-disabled on the buttons, and a drop does not call onFiles.
  it("disables the controls while parsing", () => {
    const onFiles = vi.fn();
    render(<DropZone variant="zone" disabled onFiles={onFiles} />);
    const zoneButton = screen.getByRole("button", { name: "Drop files here, or choose files" });
    expect(zoneButton).toHaveAttribute("aria-disabled", "true");
    expect(zoneButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose files" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Upload folder" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const zone = zoneButton.parentElement as HTMLElement;
    expect(zone).toHaveAttribute("aria-disabled", "true");
    fireEvent.drop(zone);
    expect(onFiles).not.toHaveBeenCalled();
  });

  // Choosing a file clears the input so the same file can be chosen again.
  // Input: one JSON file through the labelled input.
  // Expected: onFiles receives it, and the input value is empty afterwards.
  it("clears the input after a selection", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<DropZone variant="zone" disabled={false} onFiles={onFiles} />);
    const input = screen.getByLabelText("Choose JSON or zip files");
    const file = new File(["[]"], "Streaming_History_Audio_2020.json", {
      type: "application/json",
    });
    await user.upload(input, file);
    expect(onFiles).toHaveBeenCalledTimes(1);
    const sent = onFiles.mock.calls[0]?.[0] as File[];
    expect(sent[0]?.name).toBe("Streaming_History_Audio_2020.json");
    expect(input).toHaveValue("");
  });

  // Upload folder opens the directory input, not the file picker.
  // Input: a click on Upload folder.
  // Expected: the directory input's click runs.
  it("opens the directory picker from Upload folder", async () => {
    const user = userEvent.setup();
    render(<DropZone variant="zone" disabled={false} onFiles={vi.fn()} />);
    const input = screen.getByLabelText("Upload a folder");
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Upload folder" }));
    expect(click).toHaveBeenCalled();
  });
  // The hub uses one button instead of the drop target.
  // Input: the replace variant.
  // Expected: "Replace data", and no folder button.
  it("renders Replace data on the hub", () => {
    render(<DropZone variant="replace" disabled={false} onFiles={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Replace data" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Upload folder" })).not.toBeInTheDocument();
  });
});
