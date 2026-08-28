import { Input } from "@reclit/ui/input";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { HeaderActionsOutlet } from "./header-actions";

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

      {/* `actions` is the static slot; the outlet is where a page portals its
          own controls in (see header-actions.tsx). Both are right-aligned; an
          empty flex item has no size. */}
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <HeaderActionsOutlet />
      </div>
    </header>
  );
}
