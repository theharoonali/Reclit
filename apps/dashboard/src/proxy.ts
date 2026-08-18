import { updateSession } from "@repo/supabase/middleware";
import type { NextRequest } from "next/server";
import { createI18nMiddleware } from "next-international/middleware";

const I18nMiddleware = createI18nMiddleware({
  locales: ["en"],
  defaultLocale: "en",
  urlMappingStrategy: "rewrite",
});

/**
 * Refreshes the Supabase session on every request and applies i18n routing.
 * Add route gating (redirect unauthenticated users to /login, etc.) here
 * once you have auth pages.
 */
export async function proxy(request: NextRequest) {
  const { response } = await updateSession(request, I18nMiddleware(request));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
