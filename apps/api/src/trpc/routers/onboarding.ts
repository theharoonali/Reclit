import {
  finishOnboardingInput,
  skipOnboardingInput,
  suggestColumnsInput,
} from "../../modules/onboarding/onboarding.schema";
import { onboardingWizardService } from "../../modules/onboarding/onboarding-wizard.service";
import { createTRPCRouter, mapDomainError, protectedProcedure } from "../init";

// The parser-free half of the onboarding wizard. The upload routes
// (`POST /onboarding/describe`, `POST /onboarding`) are REST on the
// onboarding controller; this router must never import onboarding.service.ts,
// which pulls the CSV/XLSX parsers into the graph the dashboard transpiles.

export const onboardingRouter = createTRPCRouter({
  suggestColumns: protectedProcedure
    .input(suggestColumnsInput)
    .mutation(({ input }) =>
      onboardingWizardService.suggestColumns(input).catch(mapDomainError),
    ),

  finish: protectedProcedure
    .input(finishOnboardingInput)
    .mutation(({ input }) =>
      onboardingWizardService.finish(input).catch(mapDomainError),
    ),

  /** The upload skipped: an empty named workspace, and the flag. */
  skip: protectedProcedure
    .input(skipOnboardingInput)
    .mutation(({ input }) =>
      onboardingWizardService.skip(input).catch(mapDomainError),
    ),
});
