"use client";

import { Button } from "@reclit/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <div className="max-w-md w-full text-center px-4">
        <h2 className="text-heading mb-4">Something went wrong</h2>

        {error.digest && (
          <p className="text-caption text-muted-foreground mt-4">
            Error ID: {error.digest}
          </p>
        )}

        <Button onClick={() => reset()} variant="outline" className="mt-6">
          Try again
        </Button>
      </div>
    </div>
  );
}
