import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { fileService } from "./file.service";

// POST /files — multipart upload, field name "file", memory storage. The
// response shape is modules/file/file.schema.ts `uploadedFileSchema`. REST
// only: base64 over tRPC would inflate payloads ~33% for no benefit.

const MAX_FILE_BYTES = 25 * 1024 * 1024;

// tsconfig pins "types" to ["bun"], so multer's global Express augmentation
// is not loaded; this is the slice of the multer file object we read.
type MulterFile = {
  buffer: Uint8Array;
  originalname: string;
  mimetype: string;
};

@Controller("files")
export class FileController {
  @Post()
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_FILE_BYTES } }),
  )
  upload(@UploadedFile() file?: MulterFile) {
    if (!file) {
      throw new BadRequestException(
        'Expected a multipart upload with a "file" field',
      );
    }
    return fileService.upload(file.buffer, file.originalname, file.mimetype);
  }
}
