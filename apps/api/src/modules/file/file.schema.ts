import { z } from "zod";

// The shape POST /files returns. Stateless: there is no File table — the
// public URL stored in a cell is the only record the upload exists.

export const uploadedFileSchema = z.object({
  url: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
});

export const deleteFileInput = z.object({
  url: z.string().trim().url().max(2000),
});

/** `removed` is false when nothing was stored at the URL (already deleted). */
export const deletedFileSchema = z.object({
  url: z.string(),
  removed: z.boolean(),
});

export type UploadedFile = z.infer<typeof uploadedFileSchema>;
export type DeletedFile = z.infer<typeof deletedFileSchema>;
