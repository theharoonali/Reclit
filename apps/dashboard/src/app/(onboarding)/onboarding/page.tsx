import { OnboardingUpload } from "@/components/onboarding/onboarding-upload";
import { pageMetadata } from "@/i18n/metadata";

export const generateMetadata = () => pageMetadata("onboarding");

export default function OnboardingPage() {
  return <OnboardingUpload />;
}
