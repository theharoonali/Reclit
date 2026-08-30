"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { focusRing } from "@reclit/ui/focus-ring";
import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  APP_NAME,
  bottomNavItems,
  type NavItem,
  navSections,
  WORKSPACE,
} from "@/config/nav";

/**
 * The side menu. Owns its own collapsed width, so `AppShell` stays a server
 * component and never needs to know about the collapse state.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const tNav = useTranslations("nav");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-card transition-all duration-smooth ease-smooth md:flex",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center",
          collapsed ? "justify-center px-0" : "gap-3 px-5",
        )}
      >
        {/* Collapsed, the toggle takes the app name's slot — the rail shows
            the control and nothing else. */}
        {!collapsed && (
          <span className="truncate text-heading">{APP_NAME}</span>
        )}

        <Button
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("expand") : t("collapse")}
          className={cn(
            "shrink-0 text-muted-foreground",
            !collapsed && "ml-auto",
          )}
          onClick={() => setCollapsed((value) => !value)}
          size="icon"
          type="button"
          variant="ghost"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.titleKey} className="space-y-1">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" />
            ) : (
              <p className="px-3 pb-1 text-eyebrow uppercase text-muted-foreground">
                {tNav(`sections.${section.titleKey}`)}
              </p>
            )}
            {section.items.map((item) => (
              <NavRow
                key={item.labelKey}
                item={item}
                label={tNav(`items.${item.labelKey}`)}
                collapsed={collapsed}
                active={pathname === item.href}
              />
            ))}
          </div>
        ))}

        {/* Pushed to the bottom of the nav, still above the workspace divider. */}
        <div className="mt-auto space-y-1">
          {bottomNavItems.map((item) => (
            <NavRow
              key={item.labelKey}
              item={item}
              label={tNav(`items.${item.labelKey}`)}
              collapsed={collapsed}
              active={pathname === item.href}
            />
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-sm px-2 py-2",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-label font-semibold text-primary">
            {WORKSPACE.name.charAt(0)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-caption text-muted-foreground">
                  {t("workspace")}
                </span>
                <span className="block truncate text-label">
                  {WORKSPACE.name}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function NavRow({
  item,
  label,
  collapsed,
  active,
}: {
  item: NavItem;
  label: string;
  collapsed: boolean;
  active: boolean;
}) {
  const Icon = item.icon;
  const shared = cn(
    "relative flex items-center gap-3 rounded-sm px-3 py-2 text-body transition-colors",
    collapsed && "justify-center px-0",
    active && "bg-primary/10 font-medium text-primary",
  );

  const inner = (
    <>
      {active && (
        <span className="absolute left-0 h-5 w-0.5 rounded-r-full bg-primary" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && item.badge !== undefined && (
        <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-caption font-medium text-primary">
          {item.badge}
        </span>
      )}
    </>
  );

  if (item.disabled) {
    return (
      <span
        title={collapsed ? label : undefined}
        aria-disabled="true"
        className={cn(shared, "cursor-default text-muted-foreground/60")}
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        shared,
        !active && "text-foreground/80 hover:bg-accent hover:text-foreground",
        focusRing,
      )}
    >
      {inner}
    </Link>
  );
}
