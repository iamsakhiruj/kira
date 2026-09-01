/**
 * `categories` schema — pure, no database import (see `lib/paymentMethods.ts`
 * for why: this is safe to import from a client component's dropdown).
 * DB access lives in `lib/categoriesStore.ts`.
 *
 * One editable list per §3's "Reference" section, covering revenue and
 * expense categories both. `standaloneOnly` is the field that keeps the
 * night report's petty-cash and other-revenue pickers from being flooded
 * with categories that don't belong there — "Rent" and "Salaries" are real
 * expense categories (spec §5.2, "everything reception never touches") but
 * must never appear as an option on the 1am front-desk screen.
 */

import { z } from "zod";

export const CATEGORY_TYPES = ["revenue", "expense"] as const;

export const CategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(CATEGORY_TYPES),
  /** true = only offered on the standalone expenses/revenue screens (2.3),
   * never on the night report's own category pickers. */
  standaloneOnly: z.boolean(),
  active: z.boolean(),
  displayOrder: z.number().int(),
});

export type Category = z.infer<typeof CategorySchema>;

/** What the client sends to create or edit one. */
export const CategoryInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(CATEGORY_TYPES),
  standaloneOnly: z.boolean(),
  displayOrder: z.number().int(),
});
