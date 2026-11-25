/**
 * Tests for the file-error list: the preview cap, Show all, and dismissal.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { FileError } from "@/data/types";
import { IssueList } from "./IssueList";

describe("IssueList", () => {
  // Eleven errors show ten, grouped, until Show all.
  // Input: 6 errors in a.json and 5 in b.json.
  // Expected: Problem 10 is hidden, then visible after Show all, then hidden after Show less.
  it("caps file errors at 10 and expands them", async () => {
    const user = userEvent.setup();
    const fileErrors: FileError[] = Array.from({ length: 11 }, (_, index) => ({
      fileName: index < 6 ? "a.json" : "b.json",
      message: `Problem ${index}`,
    }));
    render(<IssueList fileErrors={fileErrors} warnings={[]} dismissible={false} />);
    expect(screen.getByText("a.json")).toBeInTheDocument();
    expect(screen.getByText("b.json")).toBeInTheDocument();
    expect(screen.getByText("Problem 9")).toBeInTheDocument();
    expect(screen.queryByText("Problem 10")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("Problem 10")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText("Problem 10")).not.toBeInTheDocument();
  });

  // A warning on the hub can be dismissed.
  // Input: one video-file warning, with dismissal on.
  // Expected: Dismiss removes the sentence.
  it("dismisses a warning when asked, and hides the control otherwise", async () => {
    const user = userEvent.setup();
    const warnings = [{ kind: "ignoredVideoFiles" as const, count: 1 }];
    render(<IssueList fileErrors={[]} warnings={warnings} dismissible />);
    expect(screen.getByText("1 video history file was skipped.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByText("1 video history file was skipped.")).not.toBeInTheDocument();

  });

  // The empty screen lists the note and does not offer Dismiss.
  // Input: the same warning with dismissible false, in a fresh render.
  // Expected: the sentence, and no dismiss button.
  it("does not offer dismiss when the list is not dismissible", () => {
    render(
      <IssueList
        fileErrors={[]}
        warnings={[{ kind: "ignoredVideoFiles", count: 1 }]}
        dismissible={false}
      />,
    );
    expect(screen.getByText("1 video history file was skipped.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dismiss/ })).not.toBeInTheDocument();
  });
});
