/**
 * The locale list is the single source of truth. Adding a language is: add the
 * code here, and add `src/messages/<code>.json` with every key translated.
 */
export const locales = ["en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Read on every request by `i18n/request.ts`. There is no URL segment. */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && locales.includes(value as Locale);
}
