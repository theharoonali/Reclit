import { Module } from "@nestjs/common";
import { OnboardingController } from "./onboarding.controller";

@Module({
  controllers: [OnboardingController],
})
export class OnboardingModule {}
