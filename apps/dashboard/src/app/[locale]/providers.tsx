"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { I18nProviderClient } from "@/locales/client";
import { TRPCReactProvider } from "@/trpc/client";

type ProviderProps = {
  locale: string;
  children: ReactNode;
};

export function Providers({ locale, children }: ProviderProps) {
  return (
    <TRPCReactProvider>
      <I18nProviderClient locale={locale}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </I18nProviderClient>
    </TRPCReactProvider>
  );
}
