import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { pageMetadata } from "@/i18n/metadata";

export const generateMetadata = () => pageMetadata("onboarding");

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
