import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * `generateMetadata` for a page whose namespace carries `title` and
 * `description`. Pages export `generateMetadata = () => pageMetadata("…")`.
 */
export async function pageMetadata(
  namespace:
    | "metadata"
    | "aiSpreadsheet"
    | "populate"
    | "settings"
    | "publicForm",
): Promise<Metadata> {
  const t = await getTranslations(namespace);
  return { title: t("title"), description: t("description") };
}
