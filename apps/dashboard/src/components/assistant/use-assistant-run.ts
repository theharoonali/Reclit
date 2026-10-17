"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useState } from "react";
import type { AssistantScope } from "@/config/assistant";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { isActiveStatus } from "@/lib/assistant/island-state";
import type {
  AssistantErrorKey,
  AssistantRun,
  TerminalStatus,
} from "@/lib/assistant/types";
import { useTRPC } from "@/trpc/client";

/** What the provider needs from the run layer. */
export type AssistantRunApi = {
  run: AssistantRun | null;
  /** A finished run remembered after `run` went back to null (unused: the run itself stays until dismissed). */
  lastTerminal: TerminalStatus | null;
  isSubmitting: boolean;
  errorKey: AssistantErrorKey | null;
  /** Resolves `true` once the run was accepted; `false` sets `errorKey`. */
  start: (prompt: string, scope: AssistantScope) => Promise<boolean>;
  cancel: () => void;
  respond: (approved: boolean) => void;
  /** Drops a finished run, or an error, from the capsule. */
  dismiss: () => void;
};

/** The tRPC code → the message key; the contract maps `ASSISTANT_BUSY` to CONFLICT and a dispatch failure to BAD_GATEWAY. */
const errorKeyOf = (error: unknown): AssistantErrorKey => {
  if (!(error instanceof TRPCClientError)) return "unknown";
  switch (error.data?.code) {
    case "CONFLICT":
      return "busy";
    case "BAD_GATEWAY":
      return "dispatch";
    default:
      return "unknown";
  }
};

/**
 * Events may repeat on reconnect and a mutation's answer may cross a stream
 * event: the newer row wins, and a different run always replaces the one
 * shown (the previous one ended).
 */
const newer = (current: AssistantRun | null, next: AssistantRun) =>
  !current ||
  current.id !== next.id ||
  next.updatedAt.getTime() >= current.updatedAt.getTime()
    ? next
    : current;

/**
 * The workspace's assistant run, live. On load `assistant.active` says
 * whether one is alive (a reload resumes the capsule mid-run); `start`
 * opens the `assistant.onChange` stream ahead of the row so the first event
 * is the insert; the stream's `closed` ends it. The run stays in the capsule
 * after it finished until `dismiss` — so there is no separate terminal
 * memory. A workspace switch drops the other workspace's run on its own:
 * the live row is only shown while it belongs to `workspaceId`.
 */
export function useAssistantRun(workspaceId: string): AssistantRunApi {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { workspaceId };
  const activeKey = trpc.assistant.active.queryKey(input);

  const active = useQuery(
    trpc.assistant.active.queryOptions(input, {
      enabled: workspaceId !== "",
      // Always ask again on a fresh mount — the whole point is to know now.
      staleTime: 0,
    }),
  );
  const [live, setLive] = useState<AssistantRun | null>(null);
  const [started, setStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<AssistantErrorKey | null>(null);

  const liveRun = live && live.workspaceId === workspaceId ? live : null;
  const run = liveRun ?? active.data ?? null;
  const runRef = useLatestRef(run);
  const isAlive = (candidate: AssistantRun | null | undefined) =>
    candidate != null && isActiveStatus(candidate.status);
  const listening =
    workspaceId !== "" && (started || isAlive(liveRun) || isAlive(active.data));

  useSubscription(
    trpc.assistant.onChange.subscriptionOptions(input, {
      enabled: listening,
      onData: (event) => {
        const change = event.data;
        if (change.type === "closed") {
          setStarted(false);
          queryClient.setQueryData(activeKey, null);
          return;
        }
        const next = change.run;
        if (next) setLive((current) => newer(current, next));
      },
      onError: (error) => console.error("[assistant] stream error:", error),
    }),
  );

  const startMutation = useMutation(trpc.assistant.start.mutationOptions());
  const cancelMutation = useMutation(trpc.assistant.cancel.mutationOptions());
  const respondMutation = useMutation(trpc.assistant.respond.mutationOptions());

  const start = useCallback(
    async (prompt: string, scope: AssistantScope) => {
      if (workspaceId === "") return false;
      setErrorKey(null);
      setIsSubmitting(true);
      // Subscribe first, so the pending row's own event is the first one in.
      setStarted(true);
      try {
        const created = await startMutation.mutateAsync({
          workspaceId,
          scope,
          prompt,
        });
        setLive((current) => newer(current, created));
        return true;
      } catch (error) {
        setStarted(false);
        setErrorKey(errorKeyOf(error));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [startMutation.mutateAsync, workspaceId],
  );

  const cancel = useCallback(() => {
    const current = runRef.current;
    if (!isAlive(current) || !current) return;
    cancelMutation.mutate(
      { id: current.id },
      {
        onSuccess: (cancelled) => setLive((live) => newer(live, cancelled)),
        // ASSISTANT_FINISHED: it ended on its own first — the stream says so.
        onError: () => {},
      },
    );
  }, [cancelMutation.mutate, runRef]);

  const respond = useCallback(
    (approved: boolean) => {
      const current = runRef.current;
      if (
        current?.status !== "awaiting_confirmation" ||
        !current.pendingAction ||
        current.pendingAction.response
      ) {
        return;
      }
      respondMutation.mutate(
        { id: current.id, approved },
        {
          onSuccess: (answered) => setLive((live) => newer(live, answered)),
          // ASSISTANT_NOT_AWAITING: the worker moved on — the stream says so.
          onError: () => {},
        },
      );
    },
    [respondMutation.mutate, runRef],
  );

  const dismiss = useCallback(() => {
    setErrorKey(null);
    const current = runRef.current;
    if (current && !isActiveStatus(current.status)) {
      setLive(null);
      queryClient.setQueryData(activeKey, null);
    }
  }, [activeKey, queryClient, runRef]);

  return {
    run,
    lastTerminal: null,
    isSubmitting,
    errorKey,
    start,
    cancel,
    respond,
    dismiss,
  };
}
