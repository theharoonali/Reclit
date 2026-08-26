import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

/**
 * The one chrome mount point. Every route in this group gets the sidebar,
 * header and footer from here — never by rendering chrome itself.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
