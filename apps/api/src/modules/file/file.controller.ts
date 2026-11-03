import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../../common/auth.guard";
import type { MulterFile } from "../../common/multipart";
import { requireFile, UploadFile } from "../../common/upload";
import { deleteFileInput } from "./file.schema";
import { fileService } from "./file.service";

// POST /files — multipart upload, field name "file", memory storage. The
// response shape is modules/file/file.schema.ts `uploadedFileSchema`. REST
// only: base64 over tRPC would inflate payloads ~33% for no benefit.
// DELETE /files — JSON body `{ url }`, the URL an upload returned.
// Upload stays public — the public form attaches files without a session —
// but only a signed-in user may delete (common/auth.guard.ts).

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

  @Delete()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  remove(@Body() body: unknown) {
    return fileService.remove(deleteFileInput.parse(body).url);
  }
}
