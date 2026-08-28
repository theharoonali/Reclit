// Shared multipart upload details. Extracted at the second consumer
// (docs/rules/COMMON.md §4): the file feature and the spreadsheet import.
// Framework-free — no @nestjs/* imports.

/**
 * tsconfig pins "types" to ["bun"], so multer's global Express augmentation is
 * not loaded; this is the slice of the multer file object the controllers read.
 */
export type MulterFile = {
  buffer: Uint8Array;
  originalname: string;
  mimetype: string;
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
