import "@/styles/globals.css";
import "@reclit/ui/globals.css";
import { Geist_Mono, Google_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { pageMetadata } from "@/i18n/metadata";
import { Providers } from "./providers";

export const generateMetadata = () => pageMetadata("metadata");

const sans = Google_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function Layout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${sans.variable} ${mono.variable} font-sans antialiased`}
      >
        {/* Rendered from a Server Component, so locale and messages are
            supplied automatically — no props to thread through. */}
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
