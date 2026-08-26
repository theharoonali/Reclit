import { cn } from "@reclit/ui/cn";

/** A failure message centred in whatever space it is given. */
export function ErrorState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex h-full w-full items-center justify-center p-8",
        className,
      )}
    >
      <p className="text-center text-subtitle text-destructive">{message}</p>
    </div>
  );
}
