import {
  applyDecorators,
  BadRequestException,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { MulterFile } from "./multipart";
import { MAX_UPLOAD_BYTES } from "./multipart";

// The multipart plumbing every upload route repeats, extracted at the second
// consumer (docs/rules/COMMON.md §4): the file feature and the spreadsheet
// import. `multipart.ts` stays framework-free — the type and the size limit are
// read by non-Nest code — so the NestJS half lives here, next to
// `domain-error.filter.ts`.
//
// A route is then:
//
//   @Post()
//   @UploadFile()
//   handler(@UploadedFile() file?: MulterFile) {
//     const upload = requireFile(file);
//   }

/** Accepts one `file` field, in memory, capped at `MAX_UPLOAD_BYTES`. */
export const UploadFile = () =>
  applyDecorators(
    UseInterceptors(
      FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }),
    ),
  );

/**
 * Narrows the optional multer file to a present one. 400 when the request was
 * not multipart, or carried no `file` field.
 */
export function requireFile(file?: MulterFile): MulterFile {
  if (!file) {
    throw new BadRequestException(
      'Expected a multipart upload with a "file" field',
    );
  }
  return file;
}
