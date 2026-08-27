import { z } from "zod";

// The shape POST /files returns. Stateless: there is no File table — the
// public URL stored in a cell is the only record the upload exists.

export const uploadedFileSchema = z.object({
  url: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
});

export type UploadedFile = z.infer<typeof uploadedFileSchema>;
