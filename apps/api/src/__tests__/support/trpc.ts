import { expect } from "bun:test";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc/init";
import { appRouter } from "../../trpc/routers/_app";

// Shared test helpers. Contract test files import from here rather than
// re-declaring setup (docs/rules/TESTING.md). Not a `*.test.ts` file, so the
// runner does not pick it up as a suite.

/** A direct tRPC caller with an empty context — the transport-free API surface. */
export const caller = createCallerFactory(appRouter)({});

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
