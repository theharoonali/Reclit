// The Resend send-email call, and nothing else. Plain `fetch` rather than the
// vendor SDK: the request is one JSON POST, and keeping it dependency-free
// means the timeout and the response parsing are ours (same reasoning as
// elevenlabs.ts and firecrawl.ts).
//
// The key is read per call and never at import time (same idiom as gemini.ts),
// so the API and the test suite boot without it; only a send fails.

export const RESEND_API_URL = "https://api.resend.com/emails";
export const RESEND_PROVIDER = "resend";
/** A send is one small request; a run must not hang on it. */
export const RESEND_TIMEOUT_MS = 30_000;
/** The verified reclit.com sender, unless `RESEND_FROM` says otherwise.
 * Not a no-reply address — one-way senders score worse with spam filters. */
export const DEFAULT_RESEND_FROM = "Reclit <hello@reclit.com>";

export type OutgoingEmail = {
  to: string;
  subject: string;
  /** Plain text body; the mail column never sends HTML. */
  text: string;
  /**
   * Resend's `Idempotency-Key` (1–256 chars, kept 24 h): the same key with
   * the same payload returns the first send's id without sending again.
   */
  idempotencyKey: string;
};

export type SentEmail = { id: string; from: string };

/** Minimal fetch surface, so the contract test can drive this without a key. */
export type SendEmailFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

function apiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to apps/api/.env (see .env.example).",
    );
  }
  return key;
}

/** The `from` header: `RESEND_FROM`, or the reclit.com default. */
export function senderAddress(): string {
  const from = process.env.RESEND_FROM?.trim();
  return from ? from : DEFAULT_RESEND_FROM;
}

/** Sends one email. Throws — the caller decides what a failure means. */
export async function sendEmail(
  email: OutgoingEmail,
  fetchImpl: SendEmailFetch = fetch as unknown as SendEmailFetch,
): Promise<SentEmail> {
  const from = senderAddress();
  const response = await fetchImpl(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend send failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const body = ((await response.json()) ?? {}) as { id?: unknown };
  if (typeof body.id !== "string" || body.id === "") {
    throw new Error("Resend returned no message id");
  }
  return { id: body.id, from };
}
