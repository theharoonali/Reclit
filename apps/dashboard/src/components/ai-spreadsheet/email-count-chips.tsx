import { cn } from "@reclit/ui/cn";

/**
 * The Mail column's send summary: a green circle counting the emails that
 * went out and, when any send failed, a red one counting those — soft tinted
 * fill, the count in the dark shade. The DOM twin of the canvas cell chips
 * (paint-cell.ts), shown in the column form as the column's overview.
 */
export function EmailCountChips({
  sent,
  failed,
  labels,
  className,
}: {
  sent: number;
  failed: number;
  labels: { sent: string; failed: string };
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <span className="flex items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-success/10 px-1.5 text-caption font-semibold text-success">
          {sent}
        </span>
        <span className="text-caption text-muted-foreground">
          {labels.sent}
        </span>
      </span>
      {failed > 0 && (
        <span className="flex items-center gap-2">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive/10 px-1.5 text-caption font-semibold text-destructive">
            {failed}
          </span>
          <span className="text-caption text-muted-foreground">
            {labels.failed}
          </span>
        </span>
      )}
    </div>
  );
}
