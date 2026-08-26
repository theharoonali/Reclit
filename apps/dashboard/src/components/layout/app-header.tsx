import { cn } from "@reclit/ui/cn";
import { Input } from "@reclit/ui/input";
import { Bell, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PLACEHOLDER_USER } from "@/config/nav";

/**
 * The top bar. Takes its content as slots so it stays feature-agnostic —
 * it never imports a feature component.
 */
export async function AppHeader({
  title,
  actions,
}: {
  title?: ReactNode;
  actions?: ReactNode;
}) {
  const t = await getTranslations("header");

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-4 md:px-6">
      {title && (
        <div className="hidden shrink-0 text-label lg:block">{title}</div>
      )}

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {actions}

        <IconButton label={t("notifications")}>
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </IconButton>

        <span className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary">
          {PLACEHOLDER_USER.initials}
        </span>
      </div>
    </header>
  );
}

function IconButton({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      {children}
    </button>
  );
}
