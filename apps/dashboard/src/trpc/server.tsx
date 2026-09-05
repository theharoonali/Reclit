import "server-only";

import type { AppRouter } from "@reclit/api/trpc/routers/_app";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCClient, httpLink } from "@trpc/client";
import {
  createTRPCOptionsProxy,
  type TRPCQueryOptions,
} from "@trpc/tanstack-react-query";
import { cache } from "react";
import superjson from "superjson";
import { API_BASE_URL } from "@/lib/api-fetch";
import { devLoggerLink } from "./logger-link";
import { makeQueryClient } from "./query-client";

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

// Server-side: prefer the internal URL (private networking) when set, then
// the same public URL the browser uses.
const SERVER_API_URL = process.env.API_INTERNAL_URL || API_BASE_URL;

const SSR_FETCH_TIMEOUT_MS = 8_000;

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  return fetch(input, { ...init, signal });
}

export const trpc = createTRPCOptionsProxy<AppRouter>({
  queryClient: getQueryClient,
  client: createTRPCClient({
    links: [
      httpLink({
        url: `${SERVER_API_URL}/trpc`,
        transformer: superjson,
        fetch: fetchWithTimeout,
      }),
      devLoggerLink(),
    ],
  }),
});

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}

// `any` is tRPC's own shape for "any procedure's options" — there is no
// narrower type that accepts every router path.
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
) {
  const queryClient = getQueryClient();

  if (queryOptions.queryKey[1]?.type === "infinite") {
    void queryClient.prefetchInfiniteQuery(queryOptions as any).catch(() => {
      // Avoid unhandled promise rejections from fire-and-forget prefetches.
    });
  } else {
    void queryClient.prefetchQuery(queryOptions).catch(() => {
      // Avoid unhandled promise rejections from fire-and-forget prefetches.
    });
  }
}
