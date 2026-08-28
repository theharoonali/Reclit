import { Controller, Post, UploadedFile } from "@nestjs/common";
import type { MulterFile } from "../../common/multipart";
import { requireFile, UploadFile } from "../../common/upload";
import { fileService } from "./file.service";

// POST /files — multipart upload, field name "file", memory storage. The
// response shape is modules/file/file.schema.ts `uploadedFileSchema`. REST
// only: base64 over tRPC would inflate payloads ~33% for no benefit.

@Controller("files")
export class FileController {
  @Post()
  @UploadFile()
  upload(@UploadedFile() file?: MulterFile) {
    const upload = requireFile(file);
    return fileService.upload(
      upload.buffer,
      upload.originalname,
      upload.mimetype,
    );
  }
}
