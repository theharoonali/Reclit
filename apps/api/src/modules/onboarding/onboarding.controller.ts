import { Body, Controller, HttpCode, Post, UploadedFile } from "@nestjs/common";
import type { MulterFile } from "../../common/multipart";
import { requireFile, UploadFile } from "../../common/upload";
import { onboardingInput } from "./onboarding.schema";
import { onboardingService } from "./onboarding.service";

// POST /onboarding — multipart: the CSV/XLSX as field "file", plus an optional
// text field "name" for the workspace. The response shape is
// onboarding.schema.ts `onboardingResultSchema`. REST only, like the
// spreadsheet import: multipart does not ride the tRPC link, and the parsers
// must stay out of the src/trpc/** graph the dashboard transpiles.

@Controller("onboarding")
export class OnboardingController {
  /** 200, not 201: the response is the whole onboarding outcome, not one resource. */
  @Post()
  @HttpCode(200)
  @UploadFile()
  complete(@Body() body: unknown, @UploadedFile() file?: MulterFile) {
    const upload = requireFile(file);
    return onboardingService.complete(
      onboardingInput.parse(body ?? {}),
      upload.buffer,
      upload.originalname,
      upload.mimetype,
    );
  }
}
