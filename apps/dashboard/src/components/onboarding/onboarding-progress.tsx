import { cn } from "@reclit/ui/cn";
import { Spinner } from "@reclit/ui/spinner";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProgressItem } from "@/lib/onboarding/progress";

/** The checklist beside the AI canvas: a check on what is done, a spinner on what is happening. */
export function OnboardingProgress({ items }: { items: ProgressItem[] }) {
  const t = useTranslations("onboarding.progress");
  return (
    <ol aria-live="polite" className="space-y-3">
      {items.map((item) => (
        <li
          className={cn(
            "flex items-center gap-3 text-body transition-colors duration-smooth ease-smooth",
            item.status === "pending" && "text-muted-foreground",
          )}
          key={item.key}
        >
          <span className="flex size-icon shrink-0 items-center justify-center">
            {item.status === "active" ? (
              <Spinner size="sm" />
            ) : item.status === "done" ? (
              <Check aria-hidden="true" className="size-icon text-success" />
            ) : (
              <span className="size-2 rounded-full bg-border" />
            )}
          </span>
          {t(item.key)}
        </li>
      ))}
    </ol>
  );
}
