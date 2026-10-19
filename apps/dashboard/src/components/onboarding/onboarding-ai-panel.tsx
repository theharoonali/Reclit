"use client";

import { cn } from "@reclit/ui/cn";
import { useTranslations } from "next-intl";
import { AssistantOrb } from "@/components/assistant/assistant-orb";
import type { ProgressItem } from "@/lib/onboarding/progress";
import { OnboardingProgress } from "./onboarding-progress";

type OnboardingAiPanelProps = {
  /** The first screen: the canvas alone, large. */
  isHero: boolean;
  /** A model call is in flight: the canvas runs. */
  isWorking: boolean;
  items: ProgressItem[];
  errorMessage: string | null;
};

/**
 * The right column: the AI canvas — large and alone on the first screen,
 * small beside the live checklist afterwards (the size change is one
 * transition). Errors sit under it so the left column stays usable.
 */
export function OnboardingAiPanel({
  isHero,
  isWorking,
  items,
  errorMessage,
}: OnboardingAiPanelProps) {
  const t = useTranslations("onboarding");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <AssistantOrb
        className={cn(
          "transition-all duration-smooth ease-smooth",
          isHero ? "size-orb-lg" : "size-orb-md",
        )}
        state={isWorking ? "running" : "idle"}
      />
      {isHero ? (
        <p className="text-caption text-muted-foreground">{t("orbCaption")}</p>
      ) : (
        <div className="animate-slide-up motion-reduce:animate-none">
          <OnboardingProgress items={items} />
        </div>
      )}
      {errorMessage && (
        <p className="text-caption text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
