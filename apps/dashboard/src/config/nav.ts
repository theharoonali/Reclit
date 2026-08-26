import {
  CalendarDays,
  Clock,
  FileUser,
  LayoutDashboard,
  type LucideIcon,
  Users,
} from "lucide-react";

/**
 * A single row in the sidebar. `disabled` marks a destination that has no route
 * yet: it renders as inert text rather than a link, because `not-found.tsx`
 * redirects unknown paths to `/` and a dead link would silently bounce the user
 * home with no explanation.
 *
 * Labels are message keys, never display text — see `src/messages/en.json`.
 */
export type NavItem = {
  /** Key into the `nav.items` namespace. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: number;
};

export type NavSection = {
  /** Key into the `nav.sections` namespace. */
  titleKey: string;
  items: NavItem[];
};

/** A brand name, not copy — deliberately not translated. */
export const APP_NAME = "Reclit";

export const navSections: NavSection[] = [
  {
    titleKey: "management",
    items: [
      { labelKey: "dashboard", href: "/", icon: LayoutDashboard },
      { labelKey: "employee", href: "/employee", icon: Users, disabled: true },
      { labelKey: "leave", href: "/leave", icon: CalendarDays, disabled: true },
      {
        labelKey: "timesheet",
        href: "/timesheet",
        icon: Clock,
        disabled: true,
      },
    ],
  },
];

/**
 * Pinned to the bottom of the sidebar, above the workspace block and inside the
 * scrolling nav area. Not a section: it carries no heading.
 */
export const bottomNavItems: NavItem[] = [
  { labelKey: "resume", href: "/resume", icon: FileUser },
];

/** Workspace name is data, not copy. Its label lives in `sidebar.workspace`. */
export const WORKSPACE = { name: "Phenomenon" };

/**
 * Placeholder identity for the header avatar. There is no auth in this repo
 * yet; replace this with the session user when it lands.
 */
export const PLACEHOLDER_USER = { name: "Alex Morgan", initials: "AM" };
