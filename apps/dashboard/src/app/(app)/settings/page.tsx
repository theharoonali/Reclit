import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/common/page-shell";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { SubscriptionSettings } from "@/components/settings/subscription-settings";
import { pageMetadata } from "@/i18n/metadata";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// Settings read live data; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

export const generateMetadata = () => pageMetadata("settings");

export default async function Page() {
  const t = await getTranslations("settings");
  prefetch(trpc.user.me.queryOptions());

  return (
    <HydrateClient>
      <PageShell description={t("description")} title={t("title")}>
        <ProfileSettings />
        <SubscriptionSettings />
      </PageShell>
    </HydrateClient>
  );
}
