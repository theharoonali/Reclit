import { generateText, Output } from "ai";
import type { RunAiEmail, RunAiInput } from "../modules/run-ai/run-ai.schema";
import type { CellGeneration } from "./cell-output";
import { coerceCellValue } from "./cell-output";
import { buildCellMessages } from "./cell-prompt";
import {
  emailCellValue,
  emailDraftSchema,
  emailRecipients,
  resolveRecipient,
} from "./email-prompt";
import { gemini } from "./gemini";
import type { SendEmailFetch } from "./resend";
import { sendEmail } from "./resend";

// The `email` node: Gemini drafts one email to a person in the row, the
// server checks the address is one the row holds, and Resend sends it. The
// cell then records what went out.
//
// Order matters, because the send is the one step that cannot be undone:
// every check that can refuse — no recipient in the row, the model choosing
// an address the row does not hold, an empty subject or body — runs before
// `sendEmail`. After it, the only failure left is the cell write, and the
// task keeps this function's `email` record on the failed run (see
// run-ai-cell.ts), so a sent message is never lost from the run's result.
//
// The draft call has no tools, so Gemini's "no tools with a JSON response
// schema" rule (cell-output.ts) does not apply. The row's media is not
// fetched: file, audio and url cells reach the model as text lines, as they
// do for a Google Search cell.

export type EmailGenerationDeps = {
  /** The run being executed: Resend's idempotency key for this send. */
  runId: string;
  fetchImpl?: SendEmailFetch;
  now?: () => Date;
};

export async function generateEmailCellValue(
  input: RunAiInput,
  deps: EmailGenerationDeps,
): Promise<CellGeneration & { email: RunAiEmail }> {
  const recipients = emailRecipients(input);
  if (recipients.length === 0) {
    throw new Error(
      `The Mail cell for column "${input.target.name}" has no one to write to: this row has no email cell with a valid address`,
    );
  }
  // `buildCellMessages` reads `target.node` and adds EMAIL_RULES itself.
  const { system, prompt } = buildCellMessages(input);
  const result = await generateText({
    model: gemini(),
    system,
    messages: [{ role: "user", content: prompt }],
    output: Output.object({ schema: emailDraftSchema }),
  });
  const draft = emailDraftSchema.parse(result.output);
  const to = resolveRecipient(draft.to, recipients);
  if (to === null) {
    throw new Error(
      `The model addressed ${JSON.stringify(draft.to)}, which is not one of this row's email cells (${recipients.join(", ")}); nothing was sent`,
    );
  }
  const subject = draft.subject.trim();
  const body = draft.body.trim();
  if (subject === "" || body === "") {
    throw new Error(
      `The model wrote an email with an empty ${subject === "" ? "subject" : "body"}; nothing was sent`,
    );
  }
  const sent = await sendEmail(
    { to, subject, text: body, idempotencyKey: deps.runId },
    deps.fetchImpl,
  );
  const email: RunAiEmail = {
    to,
    subject,
    body,
    from: sent.from,
    messageId: sent.id,
    sentAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  return {
    output: coerceCellValue(
      emailCellValue(email, input.target.type),
      input.target.type,
    ),
    model: result.response.modelId,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
    attachments: [],
    transcripts: [],
    crawls: [],
    email,
  };
}
