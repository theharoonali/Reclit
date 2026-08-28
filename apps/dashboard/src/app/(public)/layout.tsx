import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/nav";

/**
 * Chrome for public pages: none. This route group exists so pages shared by
 * link render without the sidebar/header — the FRONTEND.md rule is that
 * different chrome means a second route group, never a bespoke layout inside
 * `(app)`. The body scrolls normally; the fixed-viewport rule lives in
 * `AppShell`, which this group deliberately does not mount.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("publicForm");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex-1">{children}</div>
      <footer className="py-6 text-center text-caption text-muted-foreground">
        {t("poweredBy", { name: APP_NAME })}
      </footer>
    </div>
  );
}
