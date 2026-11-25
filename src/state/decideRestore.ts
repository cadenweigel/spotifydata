/**
 * Chooses what this tab does with the one stored dataset.
 * It does not read IndexedDB or sessionStorage. The provider passes
 * those facts in and follows the answer.
 */

import type { StoredDataset } from "./datasetStore";

export type RestoreDecision = "load" | "empty" | "empty-and-delete";

export type RestoreInput = {
  record: StoredDataset | null;
  /** True when this tab's session still holds the visit flag. */
  visitFlag: boolean;
  /** True when some other tab answered that its visit flag is set. */
  otherTabOwnsVisit: boolean;
};

/**
 * Decides whether to show the stored dataset.
 * Input is the stored record, this tab's visit flag, and whether another
 * tab still owns a non-durable visit.
 * A durable record loads either way. A session record loads only for the
 * tab that still has the flag. A leftover session record is deleted when
 * no other tab claims it, and left alone when one does.
 * Returns "load", "empty", or "empty-and-delete".
 */
export function decideRestore(input: RestoreInput): RestoreDecision {
  if (!input.record) return "empty";
  if (input.record.durable) return "load";
  if (input.visitFlag) return "load";
  if (input.otherTabOwnsVisit) return "empty";
  return "empty-and-delete";
}
