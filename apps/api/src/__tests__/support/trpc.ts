import { expect } from "bun:test";
import { isTrackedEnvelope, TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc/init";
import { appRouter } from "../../trpc/routers/_app";

// Shared test helpers. Contract test files import from here rather than
// re-declaring setup (docs/rules/TESTING.md). Not a `*.test.ts` file, so the
// runner does not pick it up as a suite.

/** A direct tRPC caller with an empty context — the transport-free API surface. */
export const caller = createCallerFactory(appRouter)({});

/**
 * A caller whose subscriptions end when `signal` aborts. The signal is per
 * caller, not per call, so each open stream gets its own.
 */
export const callerWithSignal = (signal: AbortSignal) =>
  createCallerFactory(appRouter)({}, { signal });

/** One item of a `tracked()` subscription, as the client sees it. */
export type TrackedItem<T> = { id: string; data: T };

/**
 * The next event of a subscription reached through the caller. The caller
 * skips the SSE layer, so items arrive as raw `tracked()` envelopes
 * (`[id, data, symbol]`) rather than the `{ id, data }` the link delivers;
 * this normalises them. Fails rather than hangs when nothing arrives.
 */
export async function nextTracked<T>(
  iterator: AsyncIterator<unknown>,
  timeoutMs = 10_000,
): Promise<TrackedItem<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no event within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    const result = await Promise.race([iterator.next(), timeout]);
    if (result.done) throw new Error("the stream ended");
    const value: unknown = result.value;
    if (isTrackedEnvelope(value)) return { id: value[0], data: value[1] as T };
    return value as TrackedItem<T>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asserts a procedure rejects with a given tRPC code.
 * Do not use `expect(p).rejects.toThrow(/regex/)` here — it hangs against
 * TRPCError rejections in bun 1.3.9.
 */
export async function expectTRPCError(
  promise: Promise<unknown>,
  code: TRPCError["code"],
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TRPCError);
  expect((caught as TRPCError).code).toBe(code);
}

/** Asserts a value is a real Date — superjson transports these unstringified. */
export function expectDate(value: unknown): void {
  expect(value).toBeInstanceOf(Date);
}
