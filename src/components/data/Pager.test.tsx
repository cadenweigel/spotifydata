/**
 * Tests for the table footer: the range sentence, disabled ends,
 * and First / Last once there are more than ten pages.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatInt } from "@/data/format";
import { Pager } from "./Pager";

describe("Pager", () => {
  // Ten pages do not get First and Last. Eleven do.
  // Input: page 1 of 11, then a render of page 1 of 10.
  // Expected: First is disabled, Next calls page 2, and 10 pages have no First.
  it("adds first and last only past ten pages", async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    const { unmount } = render(
      <Pager
        page={1}
        pageCount={11}
        pageSize={25}
        start={1}
        end={25}
        total={275}
        noun="artists"
        onPage={onPage}
        onPageSize={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "First" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenCalledWith(2);

    unmount();
    render(
      <Pager
        page={10}
        pageCount={10}
        pageSize={25}
        start={226}
        end={250}
        total={250}
        noun="artists"
        onPage={vi.fn()}
        onPageSize={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "First" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  // The sentence uses the grouped number and the kind's noun.
  // Input: ranks 1–100 of 4382 artists.
  // Expected: that sentence, with an en dash.
  it("describes the rows on the page", () => {
    render(
      <Pager
        page={1}
        pageCount={44}
        pageSize={100}
        start={1}
        end={100}
        total={4382}
        noun="artists"
        onPage={vi.fn()}
        onPageSize={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        `Showing ${formatInt(1)}\u2013${formatInt(100)} of ${formatInt(4382)} artists`,
      ),
    ).toBeInTheDocument();
  });
});
