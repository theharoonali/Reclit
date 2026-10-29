import { z } from "zod";
import type { RunAiEmail, RunAiInput } from "../modules/run-ai/run-ai.schema";
import type {
  CellValue,
  ColumnTypeWire,
} from "../modules/spreadsheet/spreadsheet.schema";
import { cellValueMatchesType } from "../modules/spreadsheet/spreadsheet.schema";

// Pure: the pieces of the `email` node that need no SDK, no network and no
// key — who the row lets the model write to, the shape of the draft, the
// check that the model picked one of those addresses, and the value the
// mail cell records. The contract test covers all of it offline; the model
// call and the send live in email-output.ts.

/**
 * The addresses this row lets a mail cell write to: every `email`-typed cell
 * holding a valid address, trimmed, in row order, deduped case-insensitively.
 * The model may only pick one of these — it never invents a recipient.
 */
export function emailRecipients(input: RunAiInput): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const cell of input.row.cells) {
    if (cell.type !== "email" || typeof cell.value !== "string") continue;
    const address = cell.value.trim();
    if (!cellValueMatchesType(address, "email")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(address);
  }
  return recipients;
}

/** The model's structured answer: a closed object, so Gemini accepts it. */
export const emailDraftSchema = z.object({
  to: z
    .string()
    .describe("The recipient: exactly one of the allowed recipient addresses"),
  subject: z.string().describe("The email subject line, plain text"),
  body: z
    .string()
    .describe("The email body, plain text with line breaks; no markdown"),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;

/**
 * The row's own spelling of the address the model chose, or `null` when it
 * chose something the row does not hold. Trimmed and case-insensitive: the
 * model may echo `Ada@X.test` for `ada@x.test`, never a different address.
 */
export function resolveRecipient(
  to: string,
  recipients: readonly string[],
): string | null {
  const wanted = to.trim().toLowerCase();
  return recipients.find((address) => address.toLowerCase() === wanted) ?? null;
}

/**
 * What the mail cell holds once the email is out: a one-line summary in a
 * text column, the record (without the sender) in a JSON column.
 */
export function emailCellValue(
  email: RunAiEmail,
  type: ColumnTypeWire,
): Exclude<CellValue, null> {
  if (type === "json") {
    return {
      to: email.to,
      subject: email.subject,
      body: email.body,
      messageId: email.messageId,
      sentAt: email.sentAt,
    };
  }
  return `Sent to ${email.to}: ${email.subject}`;
}
