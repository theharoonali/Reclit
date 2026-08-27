import { z } from "zod";
import { idInput } from "../../common/schema";

// Single source of truth for the Note shapes. The service infers its return
// type from `noteSchema`; the dashboard infers its types from RouterOutputs.
// Prisma model types never leave the backend (docs/rules/COMMON.md).

export const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const title = z.string().trim().min(1, "Title is required").max(200);
const content = z.string().max(10_000);

/** Create: `content` is optional and defaults to an empty string. */
export const createNoteInput = z.object({
  title,
  content: content.default(""),
});

/**
 * Update. Built from undefaulted fields on purpose: `createNoteInput.partial()`
 * would keep `content`'s `.default("")` and silently blank the column on a
 * title-only update.
 */
export const updateNoteInput = z
  .object({ title, content })
  .partial()
  .extend({ id: z.string().min(1) });

export const noteIdInput = idInput;

export type Note = z.infer<typeof noteSchema>;
export type CreateNoteInput = z.infer<typeof createNoteInput>;
export type UpdateNoteInput = z.infer<typeof updateNoteInput>;
export type NoteIdInput = z.infer<typeof noteIdInput>;
