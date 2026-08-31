import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { SubscriptionSettings } from "@/components/settings/subscription-settings";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// Settings read live data; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title"), description: t("description") };
}

export default async function Page() {
  const t = await getTranslations("settings");
  prefetch(trpc.user.me.queryOptions());

  return (
    <HydrateClient>
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 md:px-8">
        <header className="space-y-1">
          <h1 className="text-title">{t("title")}</h1>
          <p className="text-subtitle text-muted-foreground">
            {t("description")}
          </p>
        </header>

        <ProfileSettings />
        <SubscriptionSettings />
      </div>
    </HydrateClient>
  );
}
