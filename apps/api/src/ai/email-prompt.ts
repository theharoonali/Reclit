import { z } from "zod";
import type { RunAiEmail, RunAiInput } from "../modules/run-ai/run-ai.schema";
import type { CellValue } from "../modules/spreadsheet/spreadsheet.schema";

// Pure: the pieces of the `email` node that need no SDK, no network and no
// key — which addresses the row offers, the shape of the drafts, the check
// that the model picked allowed addresses, and the value the mail cell
// records. The contract test covers all of it offline; the model call and
// the sends live in email-output.ts.

/**
 * An address anywhere inside free text — the unanchored cousin of the email
 * column's whole-value check (spreadsheet.schema.ts EMAIL_RE). Local part and
 * domain are the common safe characters; the TLD at least two letters, so
 * prose like "a@b.c." doesn't flood the list with junk.
 */
const EMAIL_ANYWHERE_RE =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** A mail cell writes to at most this many addresses per run. */
export const MAX_EMAIL_RECIPIENTS = 10;

/** The uneditable tag a failed send leaves in the cell's object. */
export const EMAIL_FAILED_VALUE = "FAILED";

/** Every address found inside `text`, in order of appearance. */
export function findEmailAddresses(text: string): string[] {
  return text.match(EMAIL_ANYWHERE_RE) ?? [];
}

/**
 * The addresses this mail cell may write to: every email found in the
 * column's prompt, then in each row cell's content (objects stringified), in
 * row order — deduped case-insensitively keeping the first spelling, capped
 * at MAX_EMAIL_RECIPIENTS. The target cell itself is skipped: on a re-run it
 * holds the previous sends, and old recipients must not leak back in. The
 * model may only pick from this list — it never invents a recipient.
 */
export function emailRecipients(input: RunAiInput): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  const collect = (text: string) => {
    for (const address of findEmailAddresses(text)) {
      const key = address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push(address);
    }
  };
  collect(input.prompt);
  for (const cell of input.row.cells) {
    if (cell.index === input.target.index) continue;
    if (typeof cell.value === "string") collect(cell.value);
    else if (cell.value !== null && typeof cell.value === "object")
      collect(JSON.stringify(cell.value));
  }
  return recipients.slice(0, MAX_EMAIL_RECIPIENTS);
}

/** The model's structured answer: closed objects, so Gemini accepts them. */
export const emailDraftSchema = z.object({
  emails: z
    .array(
      z.object({
        to: z
          .string()
          .describe("The recipient: exactly one of the allowed addresses"),
        subject: z.string().describe("The email subject line, plain text"),
        body: z
          .string()
          .describe(
            "The email body, personalized for this recipient; plain text with line breaks, no markdown",
          ),
      }),
    )
    .describe(
      "One personalized email per recipient worth contacting; empty when it is not clear who to email",
    ),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>["emails"][number];

/**
 * The row's own spelling of the address the model chose, or `null` when it
 * chose something the allowed list does not hold. Trimmed and
 * case-insensitive: the model may echo `Ada@X.test` for `ada@x.test`, never
 * a different address.
 */
export function resolveRecipient(
  to: string,
  recipients: readonly string[],
): string | null {
  const wanted = to.trim().toLowerCase();
  return recipients.find((address) => address.toLowerCase() === wanted) ?? null;
}

/**
 * What the mail cell holds once the sends are done: one key per recipient,
 * the sent email (subject + body) as the value, or the FAILED tag when that
 * address's send failed. Always an object, so Mail columns are `json`.
 */
export function emailCellValue(
  emails: readonly RunAiEmail[],
): Exclude<CellValue, null> {
  const value: Record<string, string> = {};
  for (const email of emails) {
    value[email.to] =
      email.status === "sent"
        ? `Subject: ${email.subject}\n\n${email.body}`
        : EMAIL_FAILED_VALUE;
  }
  return value;
}
