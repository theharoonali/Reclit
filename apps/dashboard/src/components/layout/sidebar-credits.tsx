"use client";

import { Progress } from "@reclit/ui/progress";
import { useTranslations } from "next-intl";
import { credits } from "@/config/subscription";

/**
 * The credits meter above the account block: usage bar plus the used/total
 * count. The current plan lives next to the logo. Data is the stubbed
 * subscription config — there is no billing backend yet. Hidden entirely
 * when the sidebar is collapsed; the rail has no room for a meter.
 */
export function SidebarCredits({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("sidebar.credits");

  if (collapsed) return null;

  return (
    <div className="space-y-2 px-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-muted-foreground">{t("label")}</span>
        <span className="text-caption text-muted-foreground">
          {t("count", { used: credits.used, total: credits.total })}
        </span>
      </div>
      <Progress
        aria-label={t("progressLabel")}
        max={credits.total}
        value={credits.used}
      />
    </div>
  );
}
