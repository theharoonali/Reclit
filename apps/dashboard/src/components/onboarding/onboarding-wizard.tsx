"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { APP_NAME } from "@/config/nav";
import type { OnboardingStage } from "@/lib/onboarding/progress";
import { OnboardingAiPanel } from "./onboarding-ai-panel";
import { OnboardingColumnList } from "./onboarding-column-list";
import { OnboardingDocumentsScreen } from "./onboarding-documents-screen";
import { OnboardingFinishingScreen } from "./onboarding-finishing-screen";
import { OnboardingNameScreen } from "./onboarding-name-screen";
import { OnboardingPurposeScreen } from "./onboarding-purpose-screen";
import { OnboardingReviewScreen } from "./onboarding-review-screen";
import { OnboardingUploadScreen } from "./onboarding-upload-screen";
import { OnboardingWebsiteScreen } from "./onboarding-website-screen";
import { useOnboardingWizard } from "./use-onboarding-wizard";

/**
 * The onboarding page: two columns filling the viewport. Left, the current
 * screen, vertically centred and sliding in as the stage changes — the
 * purpose, the website, the documents, the name, the upload, the review,
 * the columns, the finishing. Right, the AI canvas, large on the screens up
 * to the upload and small beside the live checklist after them. A reload with a workspace already created resumes at the finishing
 * screen.
 */
/** The screens with the canvas alone, large — before there is anything to check off. */
const HERO_STAGES = new Set<OnboardingStage>([
  "purpose",
  "website",
  "documents",
  "name",
  "upload",
]);

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const wizard = useOnboardingWizard();

  if (wizard.isResuming) {
    return <LoadingState className="h-dvh" label={t("loading")} />;
  }
  if (wizard.resumeError) {
    return <ErrorState className="h-dvh" message={t("loadError")} />;
  }

  const { stage, company, details, columns, finishing } = wizard;
  const uploadError = details.errorKey ? t(details.errorKey) : null;
  const panelError =
    stage === "columns"
      ? columns.errorKey
      : stage === "finishing"
        ? finishing.errorKey
        : null;

  let screen: React.ReactNode;
  switch (stage) {
    case "purpose":
      screen = <OnboardingPurposeScreen company={company} />;
      break;
    case "website":
      screen = <OnboardingWebsiteScreen company={company} details={details} />;
      break;
    case "documents":
      screen = (
        <OnboardingDocumentsScreen company={company} details={details} />
      );
      break;
    case "name":
      screen = <OnboardingNameScreen details={details} />;
      break;
    case "upload":
      screen = (
        <OnboardingUploadScreen details={details} errorMessage={uploadError} />
      );
      break;
    case "review":
      screen = (
        <OnboardingReviewScreen details={details} isBusy={columns.isPending} />
      );
      break;
    case "columns":
      screen = <OnboardingColumnList columns={columns} details={details} />;
      break;
    case "finishing":
      screen = <OnboardingFinishingScreen finishing={finishing} />;
      break;
  }

  return (
    <main className="grid h-dvh grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
      <section className="flex min-h-0 flex-col overflow-hidden border-border border-b lg:border-r lg:border-b-0">
        <div className="flex shrink-0 items-center gap-2 px-6 pt-6 lg:px-10 lg:pt-10">
          <Image
            alt=""
            className="h-6 w-auto shrink-0"
            height={24}
            priority
            src="/brand/icon-fill.png"
            width={21}
          />
          <span className="truncate text-heading">{APP_NAME}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 lg:px-10 lg:pb-10">
          <div
            className="m-auto w-full max-w-lg animate-slide-in motion-reduce:animate-none"
            key={stage}
          >
            {screen}
          </div>
        </div>
      </section>
      <section className="min-h-0 overflow-y-auto bg-muted/40 p-6 lg:p-10">
        <OnboardingAiPanel
          errorMessage={panelError ? t(panelError) : null}
          isHero={HERO_STAGES.has(stage)}
          isWorking={wizard.isWorking}
          items={wizard.progress}
        />
      </section>
    </main>
  );
}
