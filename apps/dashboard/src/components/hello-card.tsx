"use client";

import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";

/**
 * Proves the end-to-end wiring: dashboard → tRPC client → api → example.hello
 */
export function HelloCard() {
  const trpc = useTRPC();
  const [name, setName] = useState<string>();

  const { data, isLoading, error, refetch } = useQuery(
    trpc.example.hello.queryOptions({ name }),
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>tRPC round trip</CardTitle>
        <CardDescription>
          Live response from <code>example.hello</code> on the API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-5 w-48" />}

        {error && (
          <p className="text-sm text-destructive">
            Could not reach the API: {error.message}
          </p>
        )}

        {data && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{data.greeting}</p>
            <p className="text-xs text-muted-foreground">{data.timestamp}</p>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setName("from the dashboard");
            refetch();
          }}
        >
          Say hello
        </Button>
      </CardContent>
    </Card>
  );
}
