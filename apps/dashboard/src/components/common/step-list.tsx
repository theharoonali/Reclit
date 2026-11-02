import { cn } from "@reclit/ui/cn";
import { Spinner } from "@reclit/ui/spinner";
import { Check, X } from "lucide-react";
import type { StepStatus } from "@/lib/dashboard/generation";

export type StepListItem = {
  key: string;
  /** Already translated — the caller owns the namespace. */
  label: string;
  status: StepStatus;
};

/**
 * A live checklist: a check on what is done, a spinner on what is happening,
 * a cross on what failed, a dot on what is still to come. The onboarding
 * wizard shows it beside the AI canvas; the dashboard's generation card
 * shows the worker's phases through it.
 */
export function StepList({
  items,
  className,
}: {
  items: StepListItem[];
  className?: string;
}) {
  return (
    <ol aria-live="polite" className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li
          className={cn(
            "flex items-center gap-3 text-body transition-colors duration-smooth ease-smooth",
            item.status === "pending" && "text-muted-foreground",
            item.status === "failed" && "text-destructive",
          )}
          key={item.key}
        >
          <span className="flex size-icon shrink-0 items-center justify-center">
            <StepMark status={item.status} />
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

function StepMark({ status }: { status: StepStatus }) {
  switch (status) {
    case "active":
      return <Spinner size="sm" />;
    case "done":
      return <Check aria-hidden="true" className="size-icon text-success" />;
    case "failed":
      return <X aria-hidden="true" className="size-icon text-destructive" />;
    default:
      return <span className="size-2 rounded-full bg-border" />;
  }
}
