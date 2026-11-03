/**
 * The website field's helpers. The api normalises too (`example.com` gets
 * `https://`); these only let the screen tell a new address from the saved
 * one and show the host.
 */

/** `example.com/` → `https://example.com`; blank → `""`. */
export function normalizeWebsite(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

/** True when `input` names the saved website (scheme, case and trailing slash aside). */
export function isSameWebsite(input: string, saved: string | null): boolean {
  if (!saved) return false;
  return (
    normalizeWebsite(input).toLowerCase() ===
    normalizeWebsite(saved).toLowerCase()
  );
}

/** `https://www.acme.com/about` → `acme.com`; unparsable → the input. */
export function websiteHost(url: string): string {
  try {
    return new URL(normalizeWebsite(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The company's initial for the avatar fallback: the name's, else the host's. */
export function companyInitial(
  name: string | null,
  website: string | null,
): string {
  const source = name?.trim() || (website ? websiteHost(website) : "");
  return source.charAt(0).toUpperCase();
}
