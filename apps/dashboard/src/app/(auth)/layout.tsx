import type { ReactNode } from "react";

/**
 * Chrome for auth: none. A signed-out user has no workspace to show, so the
 * sidebar and header of `(app)` have nothing to render — different chrome
 * means a second route group (docs/rules/FRONTEND.md). No gate either: the
 * login screen does its own session check and forwards a signed-in (or
 * DEV=TRUE) visitor to the dashboard.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh overflow-hidden bg-background">{children}</div>;
}
