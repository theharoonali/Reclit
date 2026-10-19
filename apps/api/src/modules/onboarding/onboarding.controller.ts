import { Body, Controller, HttpCode, Post, UploadedFile } from "@nestjs/common";
import type { MulterFile } from "../../common/multipart";
import { requireFile, UploadFile } from "../../common/upload";
import { onboardingInput } from "./onboarding.schema";
import { onboardingService } from "./onboarding.service";

// The wizard's two upload routes, REST only like the spreadsheet import:
// multipart does not ride the tRPC link, and the parsers must stay out of the
// src/trpc/** graph the dashboard transpiles. The response shapes are
// onboarding.schema.ts `onboardingDescriptionSchema` and
// `onboardingResultSchema`; the parser-free steps (`suggestColumns`,
// `finish`) are tRPC procedures on the `onboarding` router.

@Controller("onboarding")
export class OnboardingController {
  /** POST /onboarding/describe — the file as "file"; nothing is written. */
  @Post("describe")
  @HttpCode(200)
  @UploadFile()
  describe(@UploadedFile() file?: MulterFile) {
    const upload = requireFile(file);
    return onboardingService.describe(
      upload.buffer,
      upload.originalname,
      upload.mimetype,
    );
  }

  /**
   * POST /onboarding — the file as "file", plus the text fields "name",
   * "description", "purpose" and "columns" (a JSON array). 200, not 201: the
   * response is the whole outcome, not one resource.
   */
  @Post()
  @HttpCode(200)
  @UploadFile()
  create(@Body() body: unknown, @UploadedFile() file?: MulterFile) {
    const upload = requireFile(file);
    return onboardingService.create(
      onboardingInput.parse(body ?? {}),
      upload.buffer,
      upload.originalname,
      upload.mimetype,
    );
  }
}
