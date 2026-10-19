"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { OnboardingAiPanel } from "./onboarding-ai-panel";
import { OnboardingColumnList } from "./onboarding-column-list";
import { OnboardingReviewScreen } from "./onboarding-review-screen";
import { OnboardingUploadScreen } from "./onboarding-upload-screen";
import { OnboardingWidgetList } from "./onboarding-widget-list";
import { useOnboardingWizard } from "./use-onboarding-wizard";

/**
 * The onboarding page: two columns filling the viewport. Left, the current
 * screen, vertically centred and sliding in as the stage changes — the
 * upload, the review, the columns, the cards. Right, the AI canvas, large
 * on the first screen and small beside the live checklist after it. A
 * reload with a workspace already created resumes at the cards screen.
 */
export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const wizard = useOnboardingWizard();

  if (wizard.isResuming) {
    return <LoadingState className="h-dvh" label={t("loading")} />;
  }
  if (wizard.resumeError) {
    return <ErrorState className="h-dvh" message={t("loadError")} />;
  }

  const { stage, details, columns, widgets } = wizard;
  const uploadError = details.errorKey ? t(details.errorKey) : null;
  const panelError =
    stage === "columns"
      ? columns.errorKey
      : stage === "widgets"
        ? widgets.errorKey
        : null;

  let screen: React.ReactNode;
  switch (stage) {
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
    case "widgets":
      screen = <OnboardingWidgetList widgets={widgets} />;
      break;
  }

  return (
    <main className="grid h-dvh grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
      <section className="flex min-h-0 flex-col overflow-y-auto border-border border-b p-6 lg:border-r lg:border-b-0 lg:p-10">
        <div
          className="m-auto w-full max-w-lg animate-slide-in motion-reduce:animate-none"
          key={stage}
        >
          {screen}
        </div>
      </section>
      <section className="min-h-0 overflow-y-auto bg-muted/40 p-6 lg:p-10">
        <OnboardingAiPanel
          errorMessage={panelError ? t(panelError) : null}
          isHero={stage === "upload"}
          isWorking={wizard.isWorking}
          items={wizard.progress}
        />
      </section>
    </main>
  );
}
