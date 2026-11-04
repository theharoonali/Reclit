import { generateText, Output } from "ai";
import { describeError } from "../common/errors";
import type { RunAiEmail, RunAiInput } from "../modules/run-ai/run-ai.schema";
import type { CellCacheOptions, CellGeneration } from "./cell-output";
import {
  cellCalls,
  cellUsage,
  coerceCellValue,
  withCacheFallback,
} from "./cell-output";
import { buildCellMessages } from "./cell-prompt";
import {
  emailCellValue,
  emailDraftSchema,
  emailRecipients,
  resolveRecipient,
} from "./email-prompt";
import { aiModel } from "./model";
import type { SendEmailFetch } from "./resend";
import { sendEmail } from "./resend";

// The `email` node: the model writes one personalized email per recipient it
// decides to contact, the server checks every address against what the
// prompt and the row actually hold, and Resend sends them one by one. The
// cell then records `{address: sent text | "FAILED"}`.
//
// Order matters, because sends cannot be undone: every check that can refuse
// the whole run — no address anywhere, the model answering an empty list or
// only addresses the row does not hold — happens before the first send. A
// send that fails mid-list does not abort the rest: that address is recorded
// FAILED and the run still completes, so the cell can show sent and failed
// counts side by side. The task keeps this function's `emails` record on a
// failed run (see run-ai-cell.ts), so sent messages are never lost from the
// run's result.
//
// The draft call has no tools, so the provider's "no tools with a JSON response
// schema" rule (cell-output.ts) does not apply.

export type EmailGenerationDeps = CellCacheOptions & {
  /** The run being executed: half of Resend's per-address idempotency key. */
  runId: string;
  fetchImpl?: SendEmailFetch;
  now?: () => Date;
};

export async function generateEmailCellValue(
  input: RunAiInput,
  deps: EmailGenerationDeps,
): Promise<CellGeneration & { emails: RunAiEmail[] }> {
  const recipients = emailRecipients(input);
  if (recipients.length === 0) {
    throw new Error(
      `The Mail cell for column "${input.target.name}" has no one to write to: no email address was found in the column's prompt or this row's cells`,
    );
  }
  // `buildCellMessages` reads `target.node` and adds EMAIL_RULES itself.
  // With the batch's explicit cache the draft call runs on it, falling back
  // to the implicit path if the cache fails (cell-output.ts).
  const messages = buildCellMessages(input, new Map(), deps.company);
  const result = await withCacheFallback(
    cellCalls(messages, [], deps.cacheName),
    (call) =>
      generateText({
        model: aiModel(),
        ...call,
        output: Output.object({ schema: emailDraftSchema }),
      }),
  );
  const { emails: drafts } = emailDraftSchema.parse(result.output);

  // Keep only drafts the row can stand behind: an allowed, deduped address
  // and a non-empty subject and body. Everything dropped here was never sent.
  const taken = new Set<string>();
  const sendable: { to: string; subject: string; body: string }[] = [];
  for (const draft of drafts) {
    const to = resolveRecipient(draft.to, recipients);
    if (to === null || taken.has(to.toLowerCase())) continue;
    const subject = draft.subject.trim();
    const body = draft.body.trim();
    if (subject === "" || body === "") continue;
    taken.add(to.toLowerCase());
    sendable.push({ to, subject, body });
  }
  if (sendable.length === 0) {
    throw new Error(
      `The model could not tell who to email (allowed: ${recipients.join(", ")}); nothing was sent`,
    );
  }

  const emails: RunAiEmail[] = [];
  for (const draft of sendable) {
    try {
      const sent = await sendEmail(
        {
          to: draft.to,
          subject: draft.subject,
          text: draft.body,
          // Per address, not per run: one key for two recipients would make
          // Resend return the first send's id and silently skip the second.
          idempotencyKey: `${deps.runId}:${draft.to.toLowerCase()}`,
        },
        deps.fetchImpl,
      );
      emails.push({
        ...draft,
        status: "sent",
        from: sent.from,
        messageId: sent.id,
        sentAt: (deps.now?.() ?? new Date()).toISOString(),
      });
    } catch (error) {
      emails.push({
        ...draft,
        status: "failed",
        error: describeError(error).message,
      });
    }
  }

  return {
    output: coerceCellValue(emailCellValue(emails), input.target.type),
    model: result.response.modelId,
    usage: cellUsage(result.usage),
    attachments: [],
    conversions: [],
    crawls: [],
    emails,
  };
}
