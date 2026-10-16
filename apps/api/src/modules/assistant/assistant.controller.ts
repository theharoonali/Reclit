import { Controller, HttpCode, Post, UploadedFile } from "@nestjs/common";
import type { MulterFile } from "../../common/multipart";
import { requireFile, UploadFile } from "../../common/upload";
import { assistantTranscribeService } from "./assistant-transcribe.service";

// POST /assistant/transcribe — multipart: the recording as field "file".
// Answers `{ text, languageCode }` (assistant.schema.ts
// `assistantTranscriptionSchema`). REST only, like every upload: multipart
// does not ride the tRPC link. The runs themselves are tRPC (`assistant.*`).

@Controller("assistant")
export class AssistantController {
  /** 200, not 201: nothing is created — the text is handed back for review. */
  @Post("transcribe")
  @HttpCode(200)
  @UploadFile()
  transcribe(@UploadedFile() file?: MulterFile) {
    return assistantTranscribeService.transcribe(requireFile(file));
  }
}
