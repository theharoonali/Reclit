"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import {
  type OnboardingArea,
  onboardingRedirect,
} from "@/lib/onboarding/route";
import { useTRPC } from "@/trpc/client";

/**
 * Decides, from `user.me`, whether its route group may render. Until the user
 * is known — and while a redirect is under way — it shows a full-screen loader
 * in place of the whole group, chrome included, so nothing of the wrong screen
 * flashes. Fetched on the client, not prefetched: a dehydrated pending query
 * that fails server-side leaves the client stuck on its loader.
 *
 * Mounted once per route group layout: `(app)` with `area="app"`,
 * `(onboarding)` with `area="onboarding"`.
 */
export function OnboardingGate({
  area,
  children,
}: {
  area: OnboardingArea;
  children: ReactNode;
}) {
  const t = useTranslations("onboarding");
  const trpc = useTRPC();
  const router = useRouter();
  const me = useQuery(trpc.user.me.queryOptions());
  const target = me.data ? onboardingRedirect(me.data, area) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (me.isError) {
    return <ErrorState className="h-dvh" message={t("loadError")} />;
  }
  if (me.isPending || target) {
    return <LoadingState className="h-dvh" label={t("loading")} />;
  }
  return children;
}
