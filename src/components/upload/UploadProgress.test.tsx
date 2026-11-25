/**
 * Tests for the progress line shown while files are being read.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadProgress } from "./UploadProgress";

describe("UploadProgress", () => {
  // The count and the base name are both on screen.
  // Input: 3 of 12, with a directory still on the file name.
  // Expected: "Reading files… 3 of 12" and the base name only.
  it("shows the count and the base file name", () => {
    render(
      <UploadProgress
        progress={{
          done: 3,
          total: 12,
          fileName: "export/Streaming_History_Audio_2016.json",
        }}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Reading files… 3 of 12");
    expect(status).toHaveTextContent("Streaming_History_Audio_2016.json");
    expect(status).not.toHaveTextContent("export/");
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveProperty("value", 3);
    expect(bar).toHaveProperty("max", 12);
  });

  // Before the first file finishes, there is no count yet.
  // Input: done 0, total 0, no file name.
  // Expected: the sentence without "of", and no file name.
  it("shows a sentence without a count before the first file", () => {
    render(<UploadProgress progress={{ done: 0, total: 0, fileName: null }} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Reading files…");
    expect(status).not.toHaveTextContent("of");
  });
});
