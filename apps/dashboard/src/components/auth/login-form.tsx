"use client";

import { Button } from "@reclit/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@reclit/ui/card";
import { Input } from "@reclit/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { FormField } from "@/components/common/form-field";
import { LoadingState } from "@/components/common/loading-state";
import { APP_NAME } from "@/config/nav";
import { useTRPC } from "@/trpc/client";

/**
 * The login screen: one centred card against the env-backed dummy user
 * (auth contract — auth.api.test.ts). It first asks `auth.session`; a visitor
 * who is already signed in — or running with DEV=TRUE, where no credentials
 * are needed — is forwarded straight to the dashboard, so the form only ever
 * renders for a genuinely signed-out user.
 */
export function LoginForm() {
  const t = useTranslations("login");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const session = useQuery(trpc.auth.session.queryOptions());
  const authenticated = session.data?.authenticated === true;

  useEffect(() => {
    if (authenticated) router.replace("/");
  }, [authenticated, router]);

  const login = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async () => {
        // The gate's user.me (and everything else) must refetch with the new
        // session cookie before the dashboard mounts.
        await queryClient.invalidateQueries();
        router.replace("/");
      },
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (login.isPending) return;
    login.mutate({ email: email.trim(), password });
  };

  // Session unknown, already signed in, or login just succeeded: hold the
  // loader so the form never flashes before a redirect.
  if (session.isPending || authenticated || login.isSuccess) {
    return <LoadingState className="h-dvh" label={t("checking")} />;
  }

  const invalidCredentials = login.error?.data?.code === "UNAUTHORIZED";

  return (
    <main className="flex h-dvh items-center justify-center overflow-y-auto px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <Image
            alt=""
            className="h-8 w-auto shrink-0"
            height={32}
            priority
            src="/brand/icon-fill.png"
            width={28}
          />
          <span className="text-heading">{APP_NAME}</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>{t("heading")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={submit}>
              <FormField htmlFor="login-email" label={t("emailLabel")}>
                <Input
                  autoComplete="email"
                  autoFocus
                  id="login-email"
                  maxLength={320}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("emailPlaceholder")}
                  required
                  type="email"
                  value={email}
                />
              </FormField>

              <FormField htmlFor="login-password" label={t("passwordLabel")}>
                <Input
                  autoComplete="current-password"
                  id="login-password"
                  maxLength={200}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  required
                  type="password"
                  value={password}
                />
              </FormField>

              {login.isError && (
                <p className="text-caption text-destructive" role="alert">
                  {invalidCredentials ? t("invalidCredentials") : t("error")}
                </p>
              )}

              <Button
                className="w-full"
                disabled={email.trim().length === 0 || password.length === 0}
                type="submit"
                variant="default"
              >
                {login.isPending ? t("submitting") : t("submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
