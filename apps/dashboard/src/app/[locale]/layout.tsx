import "@/styles/globals.css";
import "@repo/ui/globals.css";
import { Toaster } from "@repo/ui/toaster";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactElement } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "App",
  description: "Your new project starts here.",
};

const sans = Geist({
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
  themeColor: [
    { media: "(prefers-color-scheme: light)" },
    { media: "(prefers-color-scheme: dark)" },
  ],
};

export default async function Layout({
  children,
  params,
}: {
  children: ReactElement;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${sans.variable} ${mono.variable} font-sans antialiased`}
      >
        <Providers locale={locale}>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
