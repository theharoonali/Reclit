"use client";

import "@/styles/globals.css";
import { Button } from "@repo/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <div className="min-h-screen flex items-center justify-center">
          <div className="max-w-md w-full text-center px-4">
            <h2 className="font-medium mb-4">Something went wrong</h2>

            {error.digest && (
              <p className="text-xs text-muted-foreground mt-4">
                Error ID: {error.digest}
              </p>
            )}

            <Button onClick={() => reset()} variant="outline" className="mt-6">
              Try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
