import { z } from "zod";

// Inputs shared by ≥2 features (docs/rules/BACKEND.md "No repetition").
// Features `.extend()` these rather than re-declaring them.

export const idInput = z.object({ id: z.string().min(1) });

/** Coerced so the same schema parses REST query strings and tRPC numbers. */
export const paginationInput = z.object({
  startRow: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
