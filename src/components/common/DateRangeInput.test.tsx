/**
 * Tests for the shared date range: an inverted pair is not applied,
 * and a valid pair is.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateRangeInput } from "./DateRangeInput";

describe("DateRangeInput", () => {
  // A start after the end is shown and not sent upward.
  // Input: from 2020-01-01, to 2020-06-01, then From is set to December.
  // Expected: no onChange, and the message. A later valid day is applied.
  it("does not apply a start date after the end date", () => {
    const onChange = vi.fn();
    render(
      <DateRangeInput
        from="2020-01-01"
        to="2020-06-01"
        min="2020-01-01"
        max="2021-01-01"
        showReset={false}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("From")).toHaveAttribute("min", "2020-01-01");
    expect(screen.getByLabelText("To")).toHaveAttribute("max", "2021-01-01");
    expect(screen.queryByRole("button", { name: "Reset dates" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-12-01" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Start date must be on or before the end date.",
    );

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-02-01" } });
    expect(onChange).toHaveBeenCalledWith("2020-02-01", "2020-06-01");
  });

  // A new applied range, such as Reset, replaces whatever is in the inputs.
  // Input: an inverted draft, then new from and to props.
  // Expected: the inputs show the new days and the message is gone.
  it("replaces the drafts when the applied range changes", () => {
    const { rerender } = render(
      <DateRangeInput
        from="2020-01-01"
        to="2020-06-01"
        showReset
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-12-01" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <DateRangeInput
        from="2020-03-01"
        to="2020-04-01"
        showReset
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("From")).toHaveValue("2020-03-01");
    expect(screen.getByLabelText("To")).toHaveValue("2020-04-01");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Reset dates is offered only when the parent says the range is narrowed.
  // Input: showReset, then a click.
  // Expected: onReset is called.
  it("resets when asked", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <DateRangeInput
        from="2020-02-01"
        to="2020-06-01"
        showReset
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reset dates" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
