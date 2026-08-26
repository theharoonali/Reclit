"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { TRPCReactProvider } from "@/trpc/client";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TRPCReactProvider>
      {/* Light only for now. The `.dark` tokens in @reclit/ui still exist and
          cannot apply while the theme is forced; drop `forcedTheme` to bring
          dark mode back. */}
      <ThemeProvider attribute="class" forcedTheme="light">
        {children}
      </ThemeProvider>
    </TRPCReactProvider>
  );
}
