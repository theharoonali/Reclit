"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

/**
 * The "Enable output" switch: reads the flag from `populate.form` (the same
 * query the API card holds, `staleTime: 0`) and writes it through
 * `populate.setOutput`, which answers the whole form — written straight into
 * the cache, then confirmed by a refetch.
 */
export function useFormOutput(spreadsheetId: string | null) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { id: spreadsheetId ?? "" };
  const form = useQuery(
    trpc.populate.form.queryOptions(input, {
      enabled: spreadsheetId !== null,
      staleTime: 0,
    }),
  );
  const mutation = useMutation(
    trpc.populate.setOutput.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(trpc.populate.form.queryKey(input), result);
        queryClient.invalidateQueries({
          queryKey: trpc.populate.form.queryKey(input),
        });
      },
    }),
  );

  return {
    enabled: form.data?.outputEnabled ?? false,
    outputCount: form.data?.outputs.length ?? 0,
    isLoading: form.isPending && spreadsheetId !== null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    set: (enabled: boolean) => {
      if (spreadsheetId) mutation.mutate({ id: spreadsheetId, enabled });
    },
  };
}
