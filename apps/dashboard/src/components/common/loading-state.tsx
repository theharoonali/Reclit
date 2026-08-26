import { cn } from "@reclit/ui/cn";
import { Spinner } from "@reclit/ui/spinner";

/**
 * The app's loading indicator: a spinner centred in whatever space it is given.
 * Fills its parent, so a parent with a definite height centres it on the page.
 *
 * `label` is not drawn — it is the accessible name, announced by screen readers
 * while the spinner carries the visual weight.
 */
export function LoadingState({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <output
      aria-live="polite"
      className={cn(
        "flex h-full w-full items-center justify-center p-8",
        className,
      )}
    >
      <Spinner size="lg" />
      <span className="sr-only">{label}</span>
    </output>
  );
}
