"use client";

import type { AppRouter } from "@reclit/api/trpc/routers/_app";
import type { QueryClient } from "@tanstack/react-query";
import { isServer, QueryClientProvider } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpBatchStreamLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import superjson from "superjson";
import { API_BASE_URL } from "@/lib/api-fetch";
import { devLoggerLink } from "./logger-link";
import { makeQueryClient } from "./query-client";

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient;

function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  if (!browserQueryClient) browserQueryClient = makeQueryClient();

  return browserQueryClient;
}

const TRPC_URL = `${API_BASE_URL}/trpc`;

/** The session cookie must cross :4000 → :4001, so every link sends credentials. */
const fetchWithCredentials = (url: RequestInfo | URL, options?: RequestInit) =>
  fetch(url, { ...options, credentials: "include" });

export function TRPCReactProvider(
  props: Readonly<{
    children: React.ReactNode;
  }>,
) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        devLoggerLink(),
        // Queries and mutations batch over one streamed request; a
        // subscription is a long-lived SSE connection (the browser's own
        // EventSource), which tRPC reconnects with the last event id.
        // Every link carries the session cookie (docs/features/auth.md).
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            url: TRPC_URL,
            transformer: superjson,
            eventSourceOptions: { withCredentials: true },
          }),
          false: splitLink({
            // auth.login / auth.logout Set-Cookie in their resolvers, which
            // a streamed response cannot carry — its headers are flushed
            // before the resolver runs — so auth rides the plain batch link.
            condition: (op) => op.path.startsWith("auth."),
            true: httpBatchLink({
              url: TRPC_URL,
              transformer: superjson,
              fetch: fetchWithCredentials,
            }),
            false: httpBatchStreamLink({
              url: TRPC_URL,
              transformer: superjson,
              fetch: fetchWithCredentials,
            }),
          }),
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
