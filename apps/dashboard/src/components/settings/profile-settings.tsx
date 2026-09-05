"use client";

import { Input } from "@reclit/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { FormField } from "@/components/common/form-field";
import { LoadingState } from "@/components/common/loading-state";
import { useTRPC } from "@/trpc/client";

/**
 * The user's profile: name and email from `user.me`, display-only for now —
 * there is no editing surface yet, so the fields render disabled (dimmed by
 * the shared disabled style). There is no auth — `user.me` is the app's
 * single user.
 */
export function ProfileSettings() {
  const t = useTranslations("settings.profile");
  const trpc = useTRPC();
  const me = useQuery(trpc.user.me.queryOptions());

  if (me.isPending) return <LoadingState label={t("loading")} />;
  if (me.isError) return <ErrorState message={t("loadError")} />;

  return (
    <section className="space-y-4">
      <h2 className="text-heading">{t("title")}</h2>

      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <FormField
          htmlFor="profile-name"
          label={t("nameLabel")}
          labelClassName="text-muted-foreground"
        >
          <Input disabled id="profile-name" readOnly value={me.data.name} />
        </FormField>

        <FormField
          htmlFor="profile-email"
          label={t("emailLabel")}
          labelClassName="text-muted-foreground"
        >
          <Input
            disabled
            id="profile-email"
            readOnly
            value={me.data.email ?? ""}
          />
        </FormField>
      </div>
    </section>
  );
}
