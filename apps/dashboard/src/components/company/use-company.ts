"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useState } from "react";
import {
  type Company,
  type CompanyErrorKey,
  type CompanyProcedure,
  type CompanyUpdate,
  companyErrorKey,
} from "@/lib/company/api";
import { trpcCodeOf } from "@/lib/onboarding/api";
import { useTRPC } from "@/trpc/client";

/** One company call: run it, watch it, read its error. `run` resolves `true` on success. */
export type CompanyAction<A extends unknown[]> = {
  run: (...args: A) => Promise<boolean>;
  isPending: boolean;
  errorKey: CompanyErrorKey | null;
  reset: () => void;
};

/** A mutation's `mutateAsync` as a `CompanyAction`, its errors mapped for `procedure`. */
function useCompanyAction<A extends unknown[]>(
  procedure: CompanyProcedure,
  mutation: {
    mutateAsync: (...args: A) => Promise<unknown>;
    isPending: boolean;
  },
): CompanyAction<A> {
  const [errorKey, setErrorKey] = useState<CompanyErrorKey | null>(null);
  const { mutateAsync } = mutation;
  const run = useCallback(
    async (...args: A) => {
      setErrorKey(null);
      try {
        await mutateAsync(...args);
        return true;
      } catch (error) {
        setErrorKey(companyErrorKey(procedure, trpcCodeOf(error)));
        return false;
      }
    },
    [mutateAsync, procedure],
  );
  const reset = useCallback(() => setErrorKey(null), []);
  return { run, isPending: mutation.isPending, errorKey, reset };
}

/**
 * The account's company profile (`company.me`) and the calls that change
 * it. Every mutation writes its answer into the `company.me` cache, so all
 * readers move together. `live` — set by the one container per screen —
 * also opens `company.onChange`, whose every `Company` replaces the cache
 * while mounted (the scrape, the background crawl, a document being read);
 * the other readers share that cache without a stream of their own.
 */
export function useCompany({ live = false }: { live?: boolean } = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.company.me.queryOptions());

  const meKey = trpc.company.me.queryKey();
  const store = (next: Company) => queryClient.setQueryData(meKey, next);

  useSubscription(
    trpc.company.onChange.subscriptionOptions(undefined, {
      enabled: live,
      onData: store,
      // tRPC reconnects on its own; without the stream the profile still
      // shows the last answer.
      onError: (error) => console.error("[company] stream error:", error),
    }),
  );

  const updateMutation = useMutation(
    trpc.company.update.mutationOptions({ onSuccess: store }),
  );
  const setWebsiteMutation = useMutation(
    trpc.company.setWebsite.mutationOptions({ onSuccess: store }),
  );
  const recrawlMutation = useMutation(
    trpc.company.recrawl.mutationOptions({ onSuccess: store }),
  );

  const update = useCompanyAction<[CompanyUpdate]>("update", updateMutation);
  const setWebsite = useCompanyAction<[string]>("setWebsite", {
    mutateAsync: (url: string) => setWebsiteMutation.mutateAsync({ url }),
    isPending: setWebsiteMutation.isPending,
  });
  const recrawl = useCompanyAction<[]>("recrawl", {
    mutateAsync: () => recrawlMutation.mutateAsync(),
    isPending: recrawlMutation.isPending,
  });

  return {
    company: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    update,
    setWebsite,
    recrawl,
  };
}

export type CompanyApi = ReturnType<typeof useCompany>;
